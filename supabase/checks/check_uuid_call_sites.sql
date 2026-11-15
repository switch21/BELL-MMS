-- Sonde de reconciliation 6 / 9 (LECTURE SEULE, un seul jeu de resultats)
-- Departage les deux hypotheses sur l'ecart entre le depot et la base :
--   a) la definition en base n'appelle plus uuid_generate_v4 (derive de definition)
--   b) la definition l'appelle, mais mon expression reguliere ne la capte pas
-- occurrences_uuid compte les apparitions du nom ; premiere_occurrence montre
-- le texte reel qui entoure la premiere, pour juger sur piece et non sur un booleen.

WITH f AS (
    SELECT p.proname,
           p.prosecdef,
           p.prosrc,
           substring(COALESCE(array_to_string(p.proconfig, ' ; '), '')
                     from 'search_path=(.+)') AS search_path_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
)
SELECT proname,
       prosecdef AS definer,
       COALESCE(search_path_cfg, '(non epingle)') AS search_path,
       (length(prosrc) - length(replace(prosrc, 'uuid_generate_v4', '')))
           / length('uuid_generate_v4') AS occurrences_uuid,
       (prosrc ~ '(^|[^.[:alnum:]_])uuid_generate_v4[[:space:]]*\(') AS uuid_non_qualifie,
       (prosrc ~ '(^|[^.[:alnum:]_])gen_random_uuid[[:space:]]*\(') AS gen_random_uuid,
       substring(prosrc from '.{0,26}uuid_generate_v4.{0,8}') AS premiere_occurrence
FROM f
WHERE prosrc ~ 'uuid_generate_v4|gen_random_uuid'
ORDER BY proname;
