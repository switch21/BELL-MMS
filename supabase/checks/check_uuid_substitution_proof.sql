-- Preuve de derive (LECTURE SEULE)
-- On remplacera gen_random_uuid() par uuid_generate_v4() dans le corps stocke,
-- puis on recalcule la signature normalisee. Si elle retombe exactement sur
-- celle du depot, les deux textes ne different QUE de ce remplacement.

SELECT p.proname,
       length(btrim(regexp_replace(
                  replace(p.prosrc, 'gen_random_uuid()', 'uuid_generate_v4()'),
                  '\s+', ' ', 'g'))) AS lg_apres_substitution,
       md5(btrim(regexp_replace(
                  replace(p.prosrc, 'gen_random_uuid()', 'uuid_generate_v4()'),
                  '\s+', ' ', 'g'))) AS sig_apres_substitution,
       (length(p.prosrc) - length(replace(p.prosrc, 'gen_random_uuid', '')))
           / length('gen_random_uuid') AS occurrences_gen_random_uuid
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('collect_sale_payment', 'create_reservation', 'create_sale')
ORDER BY p.proname;
