-- Meme contenu que supabase/migrations/027_role_access_hierarchy.sql, avec le garde-fou de
-- confirmation et un controle de coherence avant COMMIT, pour un collage dans l'editeur SQL du
-- tableau de bord. Ne jamais coller les deux : celui-ci est la voie unique.
-- Les ecrites ne partent que si bell.confirme_027 vaut 'oui'. Sans ce passage, le script ne
-- touche rien et rend une erreur.
--
-- Objet : donner un niveau a chaque role (super_admin 4, directeur_general 3, secretaire 2,
-- collaborateur 1) et exiger ce niveau avant toute ecriture sur profiles, a la fois dans la RLS
-- et dans les deux Edge Functions. Sans 027, un compte Directeur General peut retrograder,
-- renommer ou suspendre le compte super_admin, par l'ecran (admin-update-user ne compare rien)
-- comme par un PATCH direct sur /rest/v1/profiles (la politique 002:89-92 ne regarde pas la
-- ligne cible).
--
-- Ordre impose : 027 AVANT le redeploiement des Edge Functions. Les fonctions lisent
-- roles.access_level ; dans l'autre sens la creation et la modification de comptes echouent
-- jusqu'au collage, ce qui est un refus lisible, pas une donnee perdue.
--
-- ATTENTION ACCENTS : les noms des deux politiques recrees sont ceux de 002, accents compris,
-- recopies a l'identique. L'ancre 2 ci-dessous refuse le collage si ces noms exacts ne sont pas
-- trouves : une corruption par le presse-papiers arrete donc TOUT, au lieu de laisser l'ancienne
-- politique ouverte a cote de la nouvelle (le vrai risque, car deux politiques d'ecriture se
-- cumulent par OR).

-- 1. PRE-VOL LECTURE SEULE (coller seul si besoin ; dans le collage complet, l'editeur ne rend
--    que le dernier jeu de resultats, donc cette grille est masquee par la certification 6).
SELECT
    (SELECT count(*) FROM pg_policies AS pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles') AS politiques_profiles,
    (SELECT count(*) FROM public.roles AS r
      WHERE r.code IN ('super_admin', 'directeur_general', 'secretaire', 'collaborateur')) AS roles_attendus,
    col_description('public.roles'::regclass,
        (SELECT attnum FROM pg_attribute AS a
          WHERE a.attrelid = 'public.roles'::regclass AND a.attname = 'access_level')) AS niveau_deja_commente,
    (SELECT count(*) FROM public.role_permissions) AS total_matrice;

-- 2. GARDE D'APPLICATION
SELECT set_config('bell.confirme_027', 'non', false);

DO $garde$
BEGIN
    IF coalesce(current_setting('bell.confirme_027', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_027 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$garde$;

BEGIN;

-- 3. ANCHRES : etat attendu avant collage. Toute divergence arrete tout, ecrites comprises.
DO $ancre$
DECLARE
    v_roles INTEGER;
    v_noms_exact INTEGER;
    v_total INTEGER;
BEGIN
    SELECT count(*) INTO v_roles FROM public.roles AS r
    WHERE r.code IN ('super_admin', 'directeur_general', 'secretaire', 'collaborateur');
    IF v_roles <> 4 THEN
        RAISE EXCEPTION 'Ancre roles invalide : 4 roles systeme attends, % trouves.', v_roles
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_noms_exact FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
      AND pp.policyname IN ('Mise à jour personnelle de profil',
                            'Gestion des profils par les administrateurs');
    IF v_noms_exact <> 2 THEN
        RAISE EXCEPTION 'Ancre politiques invalide : les 2 noms de 002 (accents compris) doivent être trouves, % trouves.', v_noms_exact
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_total FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles';
    IF v_total <> 3 THEN
        RAISE EXCEPTION 'Ancre politiques non attendue : 3 politiques sur profiles attendues, % trouvees (collage precedent a t il deja duplique des noms ?).', v_total
            USING ERRCODE = 'P0001';
    END IF;
END
$ancre$;

-- 4. NIVEAU DES ROLES
ALTER TABLE public.roles
    ADD COLUMN IF NOT EXISTS access_level SMALLINT NOT NULL DEFAULT 1;

UPDATE public.roles AS r
SET access_level = v.lvl
FROM (VALUES
    ('super_admin', 4::SMALLINT),
    ('directeur_general', 3::SMALLINT),
    ('secretaire', 2::SMALLINT),
    ('collaborateur', 1::SMALLINT)
) AS v(code, lvl)
WHERE r.code = v.code;

-- 5. FONCTIONS DE NIVEAU (SECURITY DEFINER, search_path epingle, meme forme que get_auth_role
--    et has_permission apres 021). Une politique qui lirait profiles ou roles directement
--    serait recursive : la lecture passe donc par ces fonctions.
CREATE OR REPLACE FUNCTION public.get_auth_access_level()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE((
        SELECT r.access_level
        FROM public.profiles AS p
        JOIN public.roles AS r ON r.id = p.role_id
        WHERE p.id = auth.uid() AND p.is_active = true
    ), 0::SMALLINT);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_profile(p_profile_id UUID, p_role_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_permission('admin:users:manage')
      AND public.get_auth_access_level() >= COALESCE((
              SELECT r.access_level
              FROM public.profiles AS p
              JOIN public.roles AS r ON r.id = p.role_id
              WHERE p.id = p_profile_id
          ), 0::SMALLINT)
      AND public.get_auth_access_level() >= COALESCE((
              SELECT r.access_level
              FROM public.roles AS r
              WHERE r.id = p_role_id
          ), 0::SMALLINT);
$$;

CREATE OR REPLACE FUNCTION public.profile_role_as_stored(p_profile_id UUID, p_role_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = p_profile_id
          AND p.role_id IS DISTINCT FROM p_role_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_auth_access_level() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_profile(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_role_as_stored(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auth_access_level() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_profile(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_role_as_stored(UUID, UUID) TO authenticated;

COMMENT ON COLUMN public.roles.access_level IS
    'Niveau hierarchique du role : 4 super_admin, 3 directeur_general, 2 secretaire, 1 collaborateur.';
COMMENT ON FUNCTION public.can_manage_profile(UUID, UUID) IS
    'Verrou RLS : admin:users:manage + niveau de l appelant >= niveau de la cible et du role attribue.';

-- 6. POLITIQUES
DROP POLICY IF EXISTS "Mise a jour personnelle de profil" ON public.profiles;
DROP POLICY IF EXISTS "Mise à jour personnelle de profil" ON public.profiles;
CREATE POLICY "Mise à jour personnelle de profil"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND public.profile_role_as_stored(id, role_id));

DROP POLICY IF EXISTS "Gestion des profils par les administrateurs" ON public.profiles;
CREATE POLICY "Gestion des profils par les administrateurs"
ON public.profiles FOR ALL
TO authenticated
USING (public.can_manage_profile(id, role_id))
WITH CHECK (public.can_manage_profile(id, role_id));

-- 7. CONTROLE AVANT COMMIT : la propriete, pas un proxy.
--   (a) exactement 3 politiques sur profiles : une politique ecrite en trop = noms corrompus,
--       l'ancienne reste ouverte et le trou survit en silence ;
--   (b) la politique FOR ALL porte le verrou de niveau dans qual ET dans with_check
--       (USING seul aurait laisse un DG attribuer un role plus haut que le sien) ;
--   (c) la politique personnelle verrouille role_id dans with_check (auto-promotion) ;
--   (d) les 4 niveaux valent 4/3/2/1 et les 3 fonctions sont definer + epinglees.
DO $controle$
DECLARE
    v_total INTEGER;
    v_admin INTEGER;
    v_personnel INTEGER;
    v_niveaux INTEGER;
    v_fonctions INTEGER;
BEGIN
    SELECT count(*) INTO v_total FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles';
    IF v_total <> 3 THEN
        RAISE EXCEPTION 'Politiques profiles : 3 attendues, % trouvees.', v_total
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_admin FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
      AND pp.cmd = 'ALL'
      AND pp.qual LIKE '%can_manage_profile%'
      AND pp.with_check LIKE '%can_manage_profile%';
    IF v_admin <> 1 THEN
        RAISE EXCEPTION 'Verrou de niveau absent ou double sur la politique administrateur : 1 attendu, % trouve.', v_admin
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_personnel FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
      AND pp.cmd = 'UPDATE'
      AND pp.with_check LIKE '%profile_role_as_stored%';
    IF v_personnel <> 1 THEN
        RAISE EXCEPTION 'Verrou de role personnel absent ou double : 1 attendu, % trouve.', v_personnel
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_niveaux FROM public.roles AS r
    WHERE (r.code = 'super_admin' AND r.access_level = 4)
       OR (r.code = 'directeur_general' AND r.access_level = 3)
       OR (r.code = 'secretaire' AND r.access_level = 2)
       OR (r.code = 'collaborateur' AND r.access_level = 1);
    IF v_niveaux <> 4 THEN
        RAISE EXCEPTION 'Niveaux de roles : 4 correspondances attendues, % trouvees.', v_niveaux
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_fonctions FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_auth_access_level', 'can_manage_profile', 'profile_role_as_stored')
      AND p.prosecdef
      AND array_to_string(p.proconfig, ' ; ') LIKE '%search_path=public, pg_temp%';
    IF v_fonctions <> 3 THEN
        RAISE EXCEPTION 'Fonctions de verrou : 3 attends en SECURITY DEFINER et search_path epingle, % trouvees.', v_fonctions
            USING ERRCODE = 'P0001';
    END IF;
END
$controle$;

COMMIT;

-- 8. CERTIFICATION (LECTURE SEULE, 1 ligne, dernier jeu rendu par l'editeur).
--   Attendu : politiques_profiles_ok, verrou_niveau_admin, verrou_role_personnel, niveaux_seedes,
--             fonctions_definer_epinglees, droit_authenticated, anon_refuse valent true, et
--             total_matrice = 74 (027 ne distribue aucun droit : la matrice ne bouge pas).
SELECT
    (SELECT count(*) FROM pg_policies AS pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles') = 3 AS politiques_profiles_ok,
    (SELECT count(*) FROM pg_policies AS pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
        AND pp.cmd = 'ALL'
        AND pp.qual LIKE '%can_manage_profile%'
        AND pp.with_check LIKE '%can_manage_profile%') = 1 AS verrou_niveau_admin,
    (SELECT count(*) FROM pg_policies AS pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
        AND pp.cmd = 'UPDATE'
        AND pp.with_check LIKE '%profile_role_as_stored%') = 1 AS verrou_role_personnel,
    (SELECT count(*) FROM public.roles AS r
      WHERE (r.code = 'super_admin' AND r.access_level = 4)
         OR (r.code = 'directeur_general' AND r.access_level = 3)
         OR (r.code = 'secretaire' AND r.access_level = 2)
         OR (r.code = 'collaborateur' AND r.access_level = 1)) = 4 AS niveaux_seedes,
    (SELECT count(*) FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('get_auth_access_level', 'can_manage_profile', 'profile_role_as_stored')
        AND p.prosecdef
        AND array_to_string(p.proconfig, ' ; ') LIKE '%search_path=public, pg_temp%') = 3 AS fonctions_definer_epinglees,
    has_function_privilege('authenticated', 'public.can_manage_profile(uuid,uuid)', 'EXECUTE') AS droit_authenticated,
    NOT has_function_privilege('anon', 'public.can_manage_profile(uuid,uuid)', 'EXECUTE') AS anon_refuse,
    (SELECT count(*) FROM public.role_permissions) AS total_matrice;
