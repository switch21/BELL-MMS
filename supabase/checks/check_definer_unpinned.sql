-- Identification des SECURITY DEFINER sans search_path epingle (LECTURE SEULE)
-- Declencheur : check_uuid_class_closed.sql -> definer_non_epingles = 3 sur 17.
-- Une fonction definitrice non epinglee resout ses identifiants avec le search_path
-- de L'APPELANT : un objet homonyme plus tot dans ce chemin est visible a la place de
-- l'objet voulu. C'est le miroir du defaut 019/020 (la, le chemin est trop strict ; ici
-- il est absent).
-- Aucune ecriture : pg_proc / pg_namespace / pg_language uniquement.

WITH f AS (
    SELECT p.oid,
           p.proname,
           p.prosrc,
           l.lanname,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           substring(COALESCE(array_to_string(p.proconfig, ' ; '), '')
                     from 'search_path=([^;]+)') AS search_path_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prosecdef
)
SELECT proname,
       lanname,
       arguments,
       length(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))) AS lg_corps,
       md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g')))    AS sig_md5,
       -- references qualifiees : borne superieure du nombre d'appels "public." ou "auth."
       (length(prosrc) - length(replace(prosrc, 'public.', '')))
           / length('public.')                                AS refs_public,
       (length(prosrc) - length(replace(prosrc, 'auth.', '')))
           / length('auth.')                                  AS refs_auth,
       left(btrim(regexp_replace(prosrc, '\s+', ' ', 'g')), 260) AS corps_debut
FROM f
WHERE search_path_cfg IS NULL
ORDER BY proname;
