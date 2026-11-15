-- Certification de cloture de la classe « uuid-ossp dans un SECURITY DEFINER » (LECTURE SEULE)
-- A faire jouer APRES 020. Un seul jeu de resultats (l'editeur du dashboard n'affiche
-- pas toujours le premier jeu d'un script multi-requetes).
-- Porte sur TOUTES les fonctions de public, pas sur une liste de noms connus :
-- une liste figee ne peut pas prouver qu'il n'y a pas de 10e fonction concernee.
-- Aucune ecriture : pg_proc / pg_namespace uniquement.

WITH f AS (
    SELECT p.oid,
           p.proname,
           p.prosecdef,
           p.prosrc,
           substring(COALESCE(array_to_string(p.proconfig, ' ; '), '')
                     from 'search_path=([^;]+)') AS search_path_cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
),
flag AS (
    SELECT count(*)                                                            AS fonctions_de_public,
           count(*) FILTER (WHERE prosecdef)                                   AS dont_security_definer,
           count(*) FILTER (WHERE prosrc ~ '(^|[^.[:alnum:]_])uuid_generate_v4[[:space:]]*\(')
                                                                               AS appellent_uuid_ossp,
           count(*) FILTER (WHERE prosrc ~ '(^|[^.[:alnum:]_])gen_random_uuid[[:space:]]*\(')
                                                                               AS appellent_gen_random_uuid,
           count(*) FILTER (WHERE prosecdef AND search_path_cfg IS NULL)        AS definer_non_epingles,
           count(*) FILTER (WHERE prosecdef
                              AND prosrc ~ '(^|[^.[:alnum:]_])uuid_generate_v4[[:space:]]*\('
                              AND COALESCE(search_path_cfg, '') NOT LIKE '%extensions%')
                                                                               AS en_risque_42883
    FROM f
)
SELECT fonctions_de_public,
       dont_security_definer,
       appellent_uuid_ossp,
       appellent_gen_random_uuid,
       definer_non_epingles,
       en_risque_42883,
       (appellent_uuid_ossp = 0 AND en_risque_42883 = 0) AS classe_close,
       (definer_non_epingles = 0)                        AS epinglage_search_path_complet
FROM flag;
