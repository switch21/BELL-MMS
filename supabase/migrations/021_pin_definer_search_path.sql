-- 021 : epingle le search_path des 3 fonctions SECURITY DEFINER qui en etaient depourvues
-- Declencheur, mesure en base le 2026-11-15 (supabase/checks/check_uuid_class_closed.sql, lecture seule) :
--   fonctions_de_public = 17, dont_security_definer = 17, appellent_uuid_ossp = 0, definer_non_epingles = 3.
-- Les 9 fonctions de workflow ont ete traitees par 020 (gen_random_uuid). Celles-ci n appellent aucune
-- fonction d extension : le risque n est pas un 42883 mais une resolution d identifiants avec le
-- search_path DE L APPELANT. Une fonction definisseur execute son corps avec les privileges de son
-- proprietaire ; si le chemin de la session appelante place plus tot un objet homonyme (table, vue,
-- fonction), c est lui qui est resolu. Le depot qualifie deja toutes ses references (public.*, auth.*),
-- donc 021 ne corrige pas un bug visible : il supprime la classe de risque, comme 019/020 pour les autres.
-- Corps AUCUNEMENT modifies : uniquement ALTER FUNCTION ... SET search_path.
-- Fonctions visees (002_security_rls.sql et 003_audit_triggers.sql) :
--   get_auth_role(), has_permission(p_permission_code VARCHAR), audit_trigger_func()
-- audit_trigger_func est le trigger d audit de toutes les tables metier : la certification ci-dessous
-- est donc obligatoire apres application, pas optionnelle.
BEGIN;

-- Garde-fou prealable : aucune des 3 fonctions ne doit manquer ni etre surchargee.
-- Un ALTER FUNCTION cible une signature ; en cas de doublon on refuse d agir plutot
-- que de n epingler qu une moitie du couple, d'ou le RAISE qui annule le BEGIN/COMMIT.
DO $$
DECLARE
    v_nom TEXT;
    v_nb INT;
BEGIN
    FOREACH v_nom IN ARRAY ARRAY['get_auth_role', 'has_permission', 'audit_trigger_func']
    LOOP
        SELECT count(*) INTO v_nb
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_nom;
        IF v_nb <> 1 THEN
            RAISE EXCEPTION 'Fonction % : % signatures, une seule attendue. Transaction annulee.', v_nom, v_nb;
        END IF;
    END LOOP;
END
$$;

ALTER FUNCTION public.get_auth_role()
    SET search_path = public, pg_temp;

ALTER FUNCTION public.has_permission(p_permission_code VARCHAR)
    SET search_path = public, pg_temp;

ALTER FUNCTION public.audit_trigger_func()
    SET search_path = public, pg_temp;

COMMIT;

-- Certification (LECTURE SEULE, un seul jeu de resultats) :
--   epingle        = le search_path desire est bien enregistree sur la fonction
--   corps_conforme = le corps en base est identique octet pour octet (a la blanche pres)
--                    au corps du depot 002/003, donc 021 n a rien reecrit
-- Attendu : 3 lignes, epingle = true, corps_conforme = true.
WITH attendu(proname, lg_sig, sig_md5) AS (
    VALUES
        ('get_auth_role', 124::int, '1299989e9956aa8857c8cd420dbc3f3a'),
        ('has_permission', 292::int, 'cb6f50a302d70a72a5aafef969ede1b6'),
        ('audit_trigger_func', 1287::int, '395ce77b3447547b03d5f8fbe8bf6727')
),
actuel AS (
    SELECT p.proname,
           substring(COALESCE(array_to_string(p.proconfig, ' ; '), '')
                     from 'search_path=([^;]+)') AS search_path_cfg,
           length(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) AS lg_sig,
           md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')))    AS sig_md5
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_auth_role', 'has_permission', 'audit_trigger_func')
)
SELECT a.proname,
       COALESCE(a.search_path_cfg, '(non epingle)')       AS search_path,
       (coalesce(a.search_path_cfg, '') = 'public, pg_temp') AS epingle,
       a.lg_sig AS lg_base,
       d.lg_sig AS lg_depot,
       (a.lg_sig = d.lg_sig AND a.sig_md5 = d.sig_md5) AS corps_conforme
FROM actuel a
JOIN attendu d USING (proname)
ORDER BY a.proname;
