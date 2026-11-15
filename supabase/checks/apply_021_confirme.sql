-- Application de 021 (script a coller dans l editeur SQL du dashboard, jamais execute par l assistant)
-- Garde : le premier bloc DO refuse TOUTE ecriture tant que bell.confirme_021 vaut 'non'.
-- Pour appliquer : remplacer 'non' par 'oui' ci-dessous, puis executer. Sans cette modification,
-- le script ne touche aucune fonction et rend une erreur.
SELECT set_config('bell.confirme_021', 'non', false);

DO $$
BEGIN
    IF coalesce(current_setting('bell.confirme_021', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_021 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$$;

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
