-- 019 : couverture complete de la classe « uuid_generate_v4 » (LECTURE SEULE)
-- Le controle precedent ne portait que sur 11 noms connus. Celui-ci inventorie
-- TOUTES les fonctions de public et signale celles dont le corps appelle
-- uuid_generate_v4() sans qualification de schema, alors que le schema de
-- l'extension n'est pas dans leur search_path.
-- Aucune ecriture : pg_proc / pg_namespace uniquement.

-- 1. Detail, fonctions a risque en premier
WITH ext AS (
    SELECT n.nspname AS uuid_schema
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'uuid_generate_v4'
      AND n.nspname <> 'pg_catalog'
    ORDER BY (n.nspname = 'extensions') DESC, n.nspname
    LIMIT 1
),
f AS (
    SELECT p.proname,
           p.prosecdef,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           p.prosrc,
           COALESCE(array_to_string(p.proconfig, ' ; '), '(aucune configuration)') AS configuration,
           substring(COALESCE(array_to_string(p.proconfig, ' ; '), '')
                     from 'search_path=(.+)') AS search_path_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
),
flagged AS (
    SELECT f.proname,
           f.arguments,
           f.prosecdef,
           f.configuration,
           COALESCE(f.search_path_cfg, '(search_path non epingle)') AS search_path,
           (f.prosrc ~ '(^|[^.[:alnum:]_])uuid_generate_v4[[:space:]]*\(') AS appelle_uuid,
           (position(ext.uuid_schema IN COALESCE(f.search_path_cfg, '')) > 0) AS schema_uuid_dans_search_path
    FROM f, ext
)
SELECT proname,
       arguments,
       prosecdef AS definer,
       search_path,
       configuration,
       appelle_uuid,
       schema_uuid_dans_search_path,
       CASE
           WHEN appelle_uuid AND prosecdef AND NOT schema_uuid_dans_search_path THEN '0 - RISQUE 42883'
           WHEN appelle_uuid AND NOT prosecdef THEN '1 - A VERIFIER (chemin de l appelant)'
           WHEN appelle_uuid THEN '2 - OK'
           ELSE '3 - sans objet'
       END AS verdict
FROM flagged
ORDER BY verdict, proname;

-- 2. Synthese : en_risque doit etre a 0, a_verifier doit etre a 0
WITH ext AS (
    SELECT n.nspname AS uuid_schema
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'uuid_generate_v4'
      AND n.nspname <> 'pg_catalog'
    ORDER BY (n.nspname = 'extensions') DESC, n.nspname
    LIMIT 1
),
f AS (
    SELECT p.prosecdef,
           p.prosrc,
           substring(COALESCE(array_to_string(p.proconfig, ' ; '), '')
                     from 'search_path=(.+)') AS search_path_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
),
flagged AS (
    SELECT (f.prosrc ~ '(^|[^.[:alnum:]_])uuid_generate_v4[[:space:]]*\(') AS appelle_uuid,
           f.prosecdef AS definer,
           (position(ext.uuid_schema IN COALESCE(f.search_path_cfg, '')) > 0) AS schema_uuid_dans_search_path
    FROM f, ext
)
SELECT count(*) AS fonctions_de_public,
       count(*) FILTER (WHERE definer) AS dont_security_definer,
       count(*) FILTER (WHERE appelle_uuid) AS appellent_uuid_non_qualifie,
       count(*) FILTER (WHERE appelle_uuid AND definer AND NOT schema_uuid_dans_search_path) AS en_risque,
       count(*) FILTER (WHERE appelle_uuid AND NOT definer) AS a_verifier,
       (SELECT uuid_schema FROM ext) AS schema_de_l_extension
FROM flagged;
