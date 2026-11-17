-- Meme contenu que supabase/migrations/029_strict_hierarchy_and_system_account.sql (corps 5
-- identique, verifie par tools/controle_scripts_029.cjs), avec le garde-fou de confirmation, des
-- ancres et un controle de coherence avant COMMIT, pour un collage dans l'editeur SQL du tableau
-- de bord. Ne jamais coller les deux : celui-ci est la voie unique.
--
-- Les ecrites ne partent que si bell.confirme_029 vaut 'oui'. Sans ce passage, le script ne touche
-- rien et rend une erreur.
--
-- Objet : exiger un niveau STRICTEMENT superieur pour ecrire la ligne d'un autre compte (027 rend
-- '>=' : deux comptes super_admin, ou deux DG, se touchent l'un l'autre) et proteger le compte
-- racine : sa ligne disparait de la liste des utilisateurs pour tout le monde sauf lui, et aucune
-- ecriture d'un autre compte ne l'atteint.
--
-- Ordre impose : 029 apres 027 et 028 (les trois portent sur profiles et partagent can_manage_
-- profile), et AVANT le redploiement des Edge Functions : admin-update-user lit la colonne
-- is_system, une selection sur une colonne absente echoue et la fonction refuse toute
-- modification (fail closed, pas un contournement).
--
-- Controle explicite des risques de collage :
--   - les noms de politiques accentues en base sont LUS depuis pg_policies et passes a format('%I')
--     : aucun nom accentue n'est tape ici, donc aucune corruption possible sur cette voie ;
--   - le retrait est conditionne a la mesure du 2026-11-17 (3 politiques sur profiles) ; un autre
--     compte arrete le script plutot que de laisser 029 detruire une politique inconnue ;
--   - le script est en ASCII pur (0 octet non ASCII) : un collage mute se voit au controle de
--     presse-papiers, pas a la relecture.

-- 1. PRE-VOL LECTURE SEULE (coller seul si besoin ; dans le collage complet, seul le dernier jeu
--    de resultats est rendu, donc cette grille est masquee par la certification 6).
SELECT
    (SELECT count(*) FROM pg_attribute AS a
      WHERE a.attrelid = 'public.profiles'::regclass
        AND a.attname = 'is_system' AND NOT a.attisdropped) AS is_system_attendue_absente,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'profiles') AS politiques_profiles,
    (SELECT count(*) FROM public.profiles AS p
      JOIN public.roles AS r ON r.id = p.role_id
      WHERE r.code = 'super_admin') AS comptes_super_admin,
    (SELECT count(*) FROM public.profiles) AS comptes_profils;

-- 2. GARDE D'APPLICATION
SELECT set_config('bell.confirme_029', 'non', false);

DO $garde$
BEGIN
    IF coalesce(current_setting('bell.confirme_029', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_029 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$garde$;

BEGIN;

-- 3. ANCHRES : 027 est applique (les trois fonctions de verrou existent), la base est dans l'etat
--    mesure le 2026-11-17 (3 politiques, 1 seul super_admin).
DO $ancre$
DECLARE
    v_f     INTEGER;
    v_pol   INTEGER;
    v_super INTEGER;
BEGIN
    SELECT count(*) INTO v_f FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('can_manage_profile', 'profile_role_as_stored', 'get_auth_access_level');
    IF v_f <> 3 THEN
        RAISE EXCEPTION 'Ancre 027 absente : 3 fonctions de verrou attendues, % trouvee(s).', v_f
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_pol FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles';
    IF v_pol <> 3 THEN
        RAISE EXCEPTION 'Ancre politiques : 3 attendues sur profiles, % trouvee(s).', v_pol
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_super FROM public.profiles AS p
    JOIN public.roles AS r ON r.id = p.role_id
    WHERE r.code = 'super_admin';
    IF v_super <> 1 THEN
        RAISE EXCEPTION 'Ancre compte racine : 1 compte super_admin attendu, % trouve(s).', v_super
            USING ERRCODE = 'P0001';
    END IF;
END
$ancre$;

-- 4. CORPS DE LA MIGRATION 029 (identique au fichier de migrations)

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_system IS
    'Compte racine : retire de la vue des autres comptes, interdit de modification par un autre compte, y compris un pair de niveau egal.';

-- Le compte racine est la ligne la plus ancienne portee par le role super_admin.
-- Zero candidat ou plusieurs candidats = arret, pas de choix implicite.
DO $$
DECLARE
    v_racine UUID;
    v_nb     INT;
    v_deja   INT;
BEGIN
    SELECT count(*) INTO v_deja FROM public.profiles WHERE is_system = true;
    IF v_deja > 1 THEN
        RAISE EXCEPTION 'Compte racine : % lignes is_system deja, reparer avant 029', v_deja
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_nb
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE r.code = 'super_admin';

    IF v_nb <> 1 THEN
        RAISE EXCEPTION 'Compte racine : % comptes super_admin trouves, 1 attendu', v_nb
            USING ERRCODE = '23514';
    END IF;

    SELECT p.id INTO v_racine
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE r.code = 'super_admin'
    ORDER BY p.created_at NULLS LAST, p.id
    LIMIT 1;

    UPDATE public.profiles SET is_system = true WHERE id = v_racine;
END
$$;

-- Etat attendu mesure le 2026-11-17 : exactement 3 politiques sur profiles. On les retire par le
-- catalogue, ce qui evite de retaper un nom accentue, puis on les recree en ASCII.
DO $$
DECLARE
    v_pol INT;
    r     RECORD;
BEGIN
    SELECT count(*) INTO v_pol
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles';

    IF v_pol <> 3 THEN
        RAISE EXCEPTION 'Politiques profiles : 3 attendues avant 029, % trouvees', v_pol
            USING ERRCODE = '23514';
    END IF;

    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'profiles'
             ORDER BY policyname
    LOOP
        EXECUTE format('DROP POLICY %I ON public.profiles', r.policyname);
    END LOOP;
END
$$;

-- Predicate des politiques d'administration : niveau STRICTEMENT superieur sur la cible, niveau
-- superieur ou egal sur le role attribue, et aucune ecriture sur une ligne racine.
CREATE OR REPLACE FUNCTION public.can_manage_profile(p_profile_id UUID, p_role_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT public.has_permission('admin:users:manage')
      AND public.get_auth_access_level() > COALESCE((
              SELECT r.access_level
              FROM public.profiles AS p
              JOIN public.roles AS r ON r.id = p.role_id
              WHERE p.id = p_profile_id
          ), 0::SMALLINT)
      AND public.get_auth_access_level() >= COALESCE((
              SELECT r.access_level
              FROM public.roles AS r
              WHERE r.id = p_role_id
          ), 0::SMALLINT)
      AND NOT COALESCE((
              SELECT p.is_system
              FROM public.profiles AS p
              WHERE p.id = p_profile_id
          ), false);
$fn$;

COMMENT ON FUNCTION public.can_manage_profile(UUID, UUID) IS
    'Verrou RLS : admin:users:manage + niveau de l appelant STRICTEMENT superieur a celui de la cible, superieur ou egal a celui du role attribue, et cible non marquee is_system.';

-- Garde-fou du drapeau : la politique personnelle ne peut ni poser ni retirer is_system sur sa
-- propre ligne. Sans elle, un compte de niveau 3 se marque lui-meme racine (id = auth.uid() passe,
-- et la ligne devient alors invisible et intouchable pour tout le monde).
CREATE OR REPLACE FUNCTION public.profile_is_system_as_stored(p_profile_id UUID, p_is_system BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = p_profile_id
          AND p.is_system IS DISTINCT FROM p_is_system
    );
$fn$;

REVOKE ALL ON FUNCTION public.profile_is_system_as_stored(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_is_system_as_stored(UUID, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.profile_is_system_as_stored(UUID, BOOLEAN) IS
    'Vrai seulement si le drapeau propose est celui deja stocke : la politique personnelle ne peut pas creer de compte racine.';

-- Politique d'administration : meme verrou en USING et en WITH CHECK. WITH CHECK interdit de
-- proposer is_system = true, ce qui ferme aussi l'INSERT d'une ligne invisible.
CREATE POLICY "Gestion des profils par les administrateurs"
ON public.profiles FOR ALL
TO authenticated
USING (public.can_manage_profile(id, role_id))
WITH CHECK (public.can_manage_profile(id, role_id) AND is_system IS NOT TRUE);

-- Lecture : la ligne racine n'apparait que pour son propre titulaire.
CREATE POLICY "Lecture des profils selon hierarchie"
ON public.profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR (
        NOT is_system
        AND (
            public.has_permission('admin:users:manage')
            OR public.get_auth_role() IN ('directeur_general', 'super_admin', 'secretaire')
        )
    )
);

-- Ecriture personnelle : portee inchangee (soi-meme, sans changer son role ni se declarer racine),
-- nom en ASCII.
CREATE POLICY "Mise a jour personnelle de profil"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
    id = auth.uid()
    AND public.profile_role_as_stored(id, role_id)
    AND public.profile_is_system_as_stored(id, is_system)
);

-- 5. CONTROLE AVANT COMMIT : la propriete, pas un proxy. Chaque test est lu sur la definition
--    reelle rendue par le catalogue, jamais sur le texte de ce script.
--   (a) le drapeau existe, NOT NULL, defaut false, et vaut vrai sur exactement une ligne, portee
--       par le role super_admin ;
--   (b) la stricte hierarchie vit dans pg_get_functiondef : le test de la cible est '>' et celui
--       du role attribue '>=' ; '> COALESCE' doit apparaitre une fois et une seule (deux = la
--       regle d'attribution aurait ete durcie aussi, ce qui empecherait le compte racine de creer
--       un second super_admin ; zero = l'operateur strict n'est pas la) ;
--   (c) aucune politique d'ecriture de profiles ne se passe du verrou : soit elle appelle
--       can_manage_profile, soit elle est la politique personnelle et porte les deux gardes
--       as_stored ;
--   (d) la politique SELECT masque is_system, sinon la ligne racine reste listee a /users.
DO $controle$
DECLARE
    v_def      TEXT;
    v_strict   INTEGER;
    v_egal     INTEGER;
    v_drapeau  INTEGER;
    v_racine   INTEGER;
    v_pol      INTEGER;
    v_select   INTEGER;
    v_ecrites  INTEGER;
    v_orphelin INTEGER;
BEGIN
    SELECT count(*) INTO v_drapeau FROM public.profiles WHERE is_system = true;
    IF v_drapeau <> 1 THEN
        RAISE EXCEPTION 'Drapeau racine : 1 ligne is_system attendue, % trouvee(s).', v_drapeau
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_racine FROM public.profiles AS p
    JOIN public.roles AS r ON r.id = p.role_id
    WHERE p.is_system = true AND r.code = 'super_admin';
    IF v_racine <> 1 THEN
        RAISE EXCEPTION 'Drapeau racine pose sur une ligne qui ne porte pas super_admin (%).', v_racine
            USING ERRCODE = 'P0001';
    END IF;

    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_manage_profile';
    IF v_def IS NULL THEN
        RAISE EXCEPTION 'can_manage_profile introuvable apres 029.'
            USING ERRCODE = 'P0001';
    END IF;

    v_strict := (length(v_def) - length(replace(v_def, '> COALESCE', ''))) / length('> COALESCE');
    v_egal   := (length(v_def) - length(replace(v_def, '>= COALESCE', ''))) / length('>= COALESCE');
    IF v_strict <> 1 OR v_egal <> 1 THEN
        RAISE EXCEPTION 'Hierarchie : 1 test strict et 1 test egal attendus dans la definition, lus strict=% egal=%.', v_strict, v_egal
            USING ERRCODE = 'P0001';
    END IF;
    IF v_def NOT LIKE '%is_system%' THEN
        RAISE EXCEPTION 'can_manage_profile ne porte plus le refus de la ligne racine.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_pol FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles';
    IF v_pol <> 3 THEN
        RAISE EXCEPTION 'Politiques profiles : 3 attendues apres 029, % trouvee(s).', v_pol
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_select FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
      AND pp.cmd = 'SELECT' AND pp.qual LIKE '%is_system%';
    IF v_select <> 1 THEN
        RAISE EXCEPTION 'Politique SELECT masquant is_system : 1 attendue, % trouvee(s).', v_select
            USING ERRCODE = 'P0001';
    END IF;

    -- Toute politique non SELECT doit etre verrouillee : soit par can_manage_profile, soit (cas de
    -- la politique personnelle) par les deux gardes as_stored.
    SELECT count(*) INTO v_ecrites FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
      AND pp.cmd <> 'SELECT'
      AND NOT (
            (coalesce(pp.qual, '') LIKE '%can_manage_profile%' OR coalesce(pp.with_check, '') LIKE '%can_manage_profile%')
         OR (coalesce(pp.with_check, '') LIKE '%profile_role_as_stored%'
         AND coalesce(pp.with_check, '') LIKE '%profile_is_system_as_stored%')
      );
    IF v_ecrites <> 0 THEN
        RAISE EXCEPTION '% politique(s) d''ecriture sans verrou de niveau ou sans garde de drapeau.', v_ecrites
            USING ERRCODE = 'P0001';
    END IF;

    -- La politique personnelle ne doit plus pouvoir changer le role ni le drapeau : verifie que
    -- les deux gardes existent, et qu'aucune politique n'autorise l'INSERT sans can_manage_profile.
    SELECT count(*) INTO v_orphelin FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
      AND pp.cmd IN ('INSERT', 'ALL')
      AND coalesce(pp.with_check, '') NOT LIKE '%can_manage_profile%';
    IF v_orphelin <> 0 THEN
        RAISE EXCEPTION '% politique(s) d''insertion sans can_manage_profile.', v_orphelin
            USING ERRCODE = 'P0001';
    END IF;
END
$controle$;

COMMIT;

-- 6. CERTIFICATION (LECTURE SEULE, 1 ligne, dernier jeu rendu par l'editeur).
--   Attendu : colonne_is_system, not_null, defaut_colonne = false, racine_super_admin,
--             hierarchie_stricte, attribution_egal_autorisee, refus_racine_dans_le_verrou,
--             select_masque_racine, toutes_ecrites_verrouillees, insertion_verrouillee valent
--             true / 1 ; politiques_profiles = 3 ; drapeaux_poses = 1.
WITH d AS (
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_manage_profile'
)
SELECT
    (SELECT count(*) FROM pg_attribute AS a
      WHERE a.attrelid = 'public.profiles'::regclass
        AND a.attname = 'is_system' AND NOT a.attisdropped) = 1 AS colonne_is_system,
    (SELECT attnotnull FROM pg_attribute AS a
      WHERE a.attrelid = 'public.profiles'::regclass
        AND a.attname = 'is_system' AND NOT a.attisdropped) AS not_null,
    (SELECT pg_get_expr(d2.adbin, d2.adrelid) FROM pg_attrdef AS d2
      JOIN pg_attribute AS a ON a.attrelid = d2.adrelid AND a.attnum = d2.adnum
      WHERE a.attname = 'is_system' AND a.attrelid = 'public.profiles'::regclass) AS defaut_colonne,
    (SELECT count(*) FROM public.profiles WHERE is_system = true) AS drapeaux_poses,
    (SELECT count(*) FROM public.profiles AS p
      JOIN public.roles AS r ON r.id = p.role_id
      WHERE p.is_system = true AND r.code = 'super_admin') = 1 AS racine_super_admin,
    (SELECT (length(def) - length(replace(def, '> COALESCE', ''))) / length('> COALESCE') FROM d) = 1 AS hierarchie_stricte,
    (SELECT (length(def) - length(replace(def, '>= COALESCE', ''))) / length('>= COALESCE') FROM d) = 1 AS attribution_egal_autorisee,
    (SELECT def LIKE '%is_system%' FROM d) AS refus_racine_dans_le_verrou,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'profiles') AS politiques_profiles,
    (SELECT count(*) FROM pg_policies AS pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
        AND pp.cmd = 'SELECT' AND pp.qual LIKE '%is_system%') = 1 AS select_masque_racine,
    (SELECT count(*) FROM pg_policies AS pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
        AND pp.cmd <> 'SELECT'
        AND NOT (
              (coalesce(pp.qual, '') LIKE '%can_manage_profile%' OR coalesce(pp.with_check, '') LIKE '%can_manage_profile%')
           OR (coalesce(pp.with_check, '') LIKE '%profile_role_as_stored%'
           AND coalesce(pp.with_check, '') LIKE '%profile_is_system_as_stored%')
        )) = 0 AS toutes_ecrites_verrouillees,
    (SELECT count(*) FROM pg_policies AS pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
        AND pp.cmd IN ('INSERT', 'ALL')
        AND coalesce(pp.with_check, '') NOT LIKE '%can_manage_profile%') = 0 AS insertion_verrouillee;
