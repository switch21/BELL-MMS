-- Signature des corps stockes en base (LECTURE SEULE)
-- Equivalent SQL de la signature calculee cote depot sur les migrations :
-- les blancs sont normalises, donc une simple difference d'indentation ou de
-- fin de ligne ne fait pas bouger le md5. Un md5 different = texte different.

SELECT p.proname,
       length(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) AS lg_sig,
       md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) AS sig_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
