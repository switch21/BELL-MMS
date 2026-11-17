-- Meme contenu que supabase/migrations/030_super_admin_edite_tous_les_comptes.sql (corps identique,
-- verifie par tools/controle_scripts_030.cjs), avec le garde-fou de confirmation, des ancres et un
-- controle de coherence avant COMMIT, pour un collage dans l'editeur SQL du tableau de bord.
-- Ne jamais coller les deux : celui-ci est la voie unique.
--
-- Les ecrites ne partent que si bell.confirme_030 vaut 'oui'. Sans ce passage, le script ne touche
-- rien et rend une erreur.
--
-- Objet : exiger un niveau STRICTEMENT superieur pour ecrire la ligne d'un autre compte reste la
-- regle pour directeur_general et secretaire, mais le role super_admin est exempte de cette
-- comparaison (exigence de l'owner du 2026-11-17 : " super admin doit pouvoir modifier tous les
-- utilisateurs "). Le masque et le blocage du compte racine (029) ne bougent pas : la ligne
-- is_system = true demeure invisible et intouchable, super_admin compris.
--
-- Ordre impose : 030 apres 029. Le corps cite profiles.is_system ; sans 029 la creation de la
-- fonction echoue en 42703 et l'ancre 1 arrete le script avant toute ecriture.
--
-- Ne pas oublier apres collage : redeployer admin-update-user (le garde de niveau du code doit
-- rendre la meme exemption que la base, sinon l'ecran refuse avant meme de tenter l'ecriture).
--
-- Controle explicite des risques de collage : le script est en ASCII pur (0 octet non ASCII), il ne
-- nomime aucune politique accentuee et n'en supprime aucune.

-- 1. PRE-VOL LECTURE SEULE (coller seul si besoin ; dans le collage complet, seul le dernier jeu
--    de resultats est rendu, donc cette grille est masquee par la certification 6).
SELECT
    (SELECT count(*) FROM pg_attribute AS a
      WHERE a.attrelid = 'public.profiles'::regclass
        AND a.attname = 'is_system' AND NOT a.attisdropped) AS colonne_is_system_029,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'profiles') AS politiques_profiles,
    (SELECT position('get_auth_role() = ''super_admin'''
                     IN pg_get_functiondef(f.oid)) > 0
       FROM pg_proc AS f JOIN pg_namespace AS n ON n.oid = f.pronamespace
       WHERE n.nspname = 'public' AND f.proname = 'can_manage_profile'
         AND f.pronargs = 2) AS exemption_deja_presente,
    (SELECT count(*) FROM public.profiles AS p
      JOIN public.roles AS r ON r.id = p.role_id
      WHERE r.code = 'super_admin') AS comptes_super_admin,
    (SELECT count(*) FROM public.profiles WHERE is_system = true) AS drapeaux_poses;

-- 2. GARDE D'APPLICATION
SELECT set_config('bell.confirme_030', 'non', false);

DO $garde$
BEGIN
    IF coalesce(current_setting('bell.confirme_030', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_030 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$garde$;

BEGIN;

-- ANCHRES : 030 s'appuie sur 029 (la colonne is_system, citee par le corps) et ne concoit le
--    depart que dans l'etat mesure le 2026-11-17 (3 politiques sur profiles). Un autre compte
--    arrete le script plutot que de laisser une ecriture partielle derriere elle.
DO $$
DECLARE
    v_att INTEGER;
    v_pol INTEGER;
    v_sig INTEGER;
BEGIN
    SELECT count(*) INTO v_att
    FROM pg_attribute AS a
    WHERE a.attrelid = 'public.profiles'::regclass
      AND a.attname = 'is_system' AND NOT a.attisdropped;

    IF v_att <> 1 THEN
        RAISE EXCEPTION '030 exige la colonne profiles.is_system de 029 : % trouvee, 1 attendue', v_att
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_pol
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles';

    IF v_pol <> 3 THEN
        RAISE EXCEPTION '030 ne touche pas les politiques : 3 attendues sur profiles, % trouvees', v_pol
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_sig
    FROM pg_proc AS f
    JOIN pg_namespace AS n ON n.oid = f.pronamespace
    WHERE n.nspname = 'public' AND f.proname = 'can_manage_profile' AND f.pronargs = 2;

    IF v_sig <> 1 THEN
        RAISE EXCEPTION 'can_manage_profile(UUID, UUID) introuvable (027/029) : % fonction(s)', v_sig
            USING ERRCODE = '23514';
    END IF;
END
$$;

-- LE VERROU : exemption de niveau pour le super_admin, tout le reste de 029 conserve.
CREATE OR REPLACE FUNCTION public.can_manage_profile(p_profile_id UUID, p_role_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT public.has_permission('admin:users:manage')
      AND (
              public.get_auth_role() = 'super_admin'
              OR public.get_auth_access_level() > COALESCE((
                      SELECT r.access_level
                      FROM public.profiles AS p
                      JOIN public.roles AS r ON r.id = p.role_id
                      WHERE p.id = p_profile_id
                  ), 0::SMALLINT)
          )
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
    'Verrou RLS : admin:users:manage, niveau STRICTEMENT superieur a la cible SAUF pour le role super_admin (exempte de comparaison), niveau superieur ou egal au role attribue, et cible non marquee is_system.';

-- 5. CONTROLE AVANT COMMIT : la definition rendue par le catalogue porte bien les quatre clauses,
--    aucune politique n'a bouge, et le drapeau racine est toujours pose une seule fois.
DO $controle$
DECLARE
    v_def   TEXT;
    n       INTEGER;
    v_pol   INTEGER;
    v_select INTEGER;
    v_ins   INTEGER;
    v_dr    INTEGER;
    v_super INTEGER;
BEGIN
    SELECT pg_get_functiondef(f.oid) INTO v_def
    FROM pg_proc AS f JOIN pg_namespace AS n ON n.oid = f.pronamespace
    WHERE n.nspname = 'public' AND f.proname = 'can_manage_profile' AND f.pronargs = 2;

    -- (a) l'exemption super_admin est dans le corps, une seule fois ;
    n := (length(v_def) - length(replace(v_def, 'get_auth_role() = ''super_admin''', '')))
          / length('get_auth_role() = ''super_admin''');
    IF n <> 1 THEN
        RAISE EXCEPTION 'Controle 030 : exemption super_admin % fois dans la definition, 1 attendue', n
            USING ERRCODE = '23514';
    END IF;

    -- (b) la comparaison stricte sur la cible survit pour les autres roles ;
    n := (length(v_def) - length(replace(v_def, '> COALESCE', ''))) / length('> COALESCE');
    IF n <> 1 THEN
        RAISE EXCEPTION 'Controle 030 : comparaison stricte de cible % fois, 1 attendue', n
            USING ERRCODE = '23514';
    END IF;

    -- (c) l'attribution d'un role de niveau egal reste permise, celle d'un role plus haut non ;
    n := (length(v_def) - length(replace(v_def, '>= COALESCE', ''))) / length('>= COALESCE');
    IF n <> 1 THEN
        RAISE EXCEPTION 'Controle 030 : clause d attribution % fois, 1 attendue', n
            USING ERRCODE = '23514';
    END IF;

    -- (d) le blocage de la ligne racine n'a pas disparu avec l'exemption ;
    IF v_def NOT LIKE '%is_system%' THEN
        RAISE EXCEPTION 'Controle 030 : la definition ne refuse plus is_system'
            USING ERRCODE = '23514';
    END IF;

    -- (e) la fonction reste SECURITY DEFINER avec search_path epingle ;
    IF v_def NOT LIKE '%SECURITY DEFINER%'
       OR v_def NOT LIKE '%SET search_path = public, pg_temp%' THEN
        RAISE EXCEPTION 'Controle 030 : DEFINER ou search_path epingle perdus'
            USING ERRCODE = '23514';
    END IF;

    -- (f) 030 ne touche pas les politiques : trois, avec le verrou en USING et en WITH CHECK ;
    SELECT count(*) INTO v_pol FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles';
    IF v_pol <> 3 THEN
        RAISE EXCEPTION 'Controle 030 : % politiques sur profiles, 3 attendues', v_pol
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_ins FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
      AND pp.cmd = 'ALL'
      AND pp.qual LIKE '%can_manage_profile%'
      AND pp.with_check LIKE '%can_manage_profile%'
      AND pp.with_check LIKE '%is_system IS NOT TRUE%';
    IF v_ins <> 1 THEN
        RAISE EXCEPTION 'Controle 030 : politique administrateur USING+WITH CHECK % (1 attendu)', v_ins
            USING ERRCODE = '23514';
    END IF;

    -- (g) le masque SELECT de 029 tient toujours : la clause NOT is_system y est presentee
    --     avec le filtre du titulaire, et la politique n'a pas ete recopiee par 030.
    SELECT count(*) INTO v_select FROM pg_policies AS pp
    WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
      AND pp.cmd = 'SELECT'
      AND pp.qual LIKE '%NOT is_system%';
    IF v_select <> 1 THEN
        RAISE EXCEPTION 'Controle 030 : politique SELECT masquant la racine % (1 attendue)', v_select
            USING ERRCODE = '23514';
    END IF;

    -- (h) le drapeau racine est pose une seule fois et porte par un super_admin ;
    SELECT count(*) INTO v_dr FROM public.profiles WHERE is_system = true;
    IF v_dr <> 1 THEN
        RAISE EXCEPTION 'Controle 030 : % lignes is_system, 1 attendue', v_dr
            USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO v_super FROM public.profiles AS p
    JOIN public.roles AS r ON r.id = p.role_id
    WHERE p.is_system = true AND r.code = 'super_admin';
    IF v_super <> 1 THEN
        RAISE EXCEPTION 'Controle 030 : la ligne racine n est plus portee par super_admin : %'  , v_super
            USING ERRCODE = '23514';
    END IF;
END
$controle$;

COMMIT;

-- 6. CERTIFICATION : le seul jeu rendu apres COMMIT, en lecture seule. Treize juges, tous booleens,
--    tous attendus a true. Un false nomme la clause que la base ne rend pas.
WITH d AS (
    SELECT pg_get_functiondef(f.oid) def, f.pronargs args
    FROM pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
    WHERE n.nspname = 'public' AND f.proname = 'can_manage_profile' AND f.pronargs = 2
),
pol AS (
    SELECT count(*) nb FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
)
SELECT
    (SELECT count(*) FROM pg_attribute a
      WHERE a.attrelid = 'public.profiles'::regclass
        AND a.attname = 'is_system' AND NOT a.attisdropped) = 1        AS colonne_is_system,
    (SELECT args FROM d) = 2                                           AS signature_inchangee,
    (SELECT def LIKE '%SECURITY DEFINER%' FROM d)                     AS security_definer,
    (SELECT def LIKE '%SET search_path = public, pg_temp%' FROM d)    AS search_path_epingle,
    (SELECT (length(def) - length(replace(def,
        'get_auth_role() = ''super_admin''', '')))
        / length('get_auth_role() = ''super_admin''') = 1 FROM d)     AS exemption_super_admin_une_fois,
    (SELECT (length(def) - length(replace(def, '> COALESCE', '')))
        / length('> COALESCE') = 1 FROM d)                            AS cible_stricte_pour_les_autres,
    (SELECT (length(def) - length(replace(def, '>= COALESCE', '')))
        / length('>= COALESCE') = 1 FROM d)                           AS attribution_egal_conservee,
    (SELECT def LIKE '%is_system%' FROM d)                             AS refus_racine_conserve,
    (SELECT nb FROM pol) = 3                                           AS politiques_profiles,
    (SELECT count(*) FROM pg_policies pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
        AND pp.cmd = 'SELECT' AND pp.qual LIKE '%NOT is_system%') = 1  AS select_masque_racine,
    (SELECT count(*) FROM pg_policies pp
      WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
        AND pp.cmd = 'ALL' AND pp.with_check LIKE '%is_system IS NOT TRUE%') = 1
                                                                       AS insertion_verrouillee,
    (SELECT count(*) FROM public.profiles WHERE is_system = true) = 1  AS drapeau_racine_unique,
    (SELECT description FROM pg_description dsc
      JOIN pg_proc f ON f.oid = dsc.objoid
      WHERE f.proname = 'can_manage_profile' AND f.pronargs = 2
        AND dsc.objsubid = 0) LIKE '%super_admin (exempte%'            AS commentaire_verrou_a_jour;
-- ATTENDU : les treize colonnes a true. exemption_super_admin_une_fois = false dit que la clause
-- est absente (030 pas passe) ou doublee (deux exemptions, la lecture ne dit plus laquelle gagne).
