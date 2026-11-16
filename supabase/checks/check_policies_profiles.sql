-- Sonde LECTURE SEULE : etat reel des politiques RLS de public.profiles.
-- A coller seul (un seul jeu de resultats). Utile dans un cas precis : le collage de 027 refuse a
-- son ancre 2 parce que les deux noms de politiques de 002 (accents compris) ne sont pas trouves.
-- Ce sont soit des noms reellement differentes en base, soit des octets corrompus par le
-- presse-papiers ; cette grille rend les noms tels que la base les porte, sans rien modifier.
-- Attendu avant 027 : 3 lignes, SELECT / UPDATE / ALL, verrou_niveau et verrou_role a false.
SELECT
    pp.policyname,
    pp.cmd,
    pp.qual IS NOT NULL AS filtre_lu,
    coalesce(pp.with_check, '') AS filtre_ecrit,
    (pp.qual LIKE '%can_manage_profile%') AS verrou_niveau_lu,
    (coalesce(pp.with_check, '') LIKE '%can_manage_profile%') AS verrou_niveau_ecrit,
    (coalesce(pp.with_check, '') LIKE '%profile_role_as_stored%') AS verrou_role_personnel,
    (pp.qual LIKE '%has_permission%' OR coalesce(pp.with_check, '') LIKE '%has_permission%') AS passe_part_has_permission,
    (pp.qual LIKE '%auth.uid()%' OR coalesce(pp.with_check, '') LIKE '%auth.uid()%') AS filtre_auth_uid
FROM pg_policies AS pp
WHERE pp.schemaname = 'public' AND pp.tablename = 'profiles'
ORDER BY pp.cmd, pp.policyname;
