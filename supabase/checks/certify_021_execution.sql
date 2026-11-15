-- Certification d EXECUTION des fonctions epinglees par 021 (LECTURE SEULE sur les donnees)
-- Pourquoi : 021 a verifie la DEFINITION (search_path enregistree + corps identique au depot).
-- Une definer dont on vient de figer le search_path doit surtout continuer de s executer.
-- Ce script rejoue get_auth_role() et has_permission() avec une identite de session reelle,
-- comme le ferait PostgREST, ce que la base ne pouvait pas montrer avec auth.uid() = NULL.
--
-- Statement 1 : pose l identite (GUC de session, aucune donnee ecrite).
-- Statement 2 : execute les fonctions et rend le tableau.
-- A noter : set_config et l appel aux fonctions sont separe parce que PostgreSQL evalue les
-- expressions d une meme liste de projection dans un ordre non garantie.

SELECT set_config('request.jwt.claims',
                  (SELECT json_build_object('sub', u.id, 'role', 'authenticated')::text
                     FROM auth.users u
                     JOIN public.profiles p ON p.id = u.id
                     JOIN public.roles r    ON r.id = p.role_id
                    WHERE u.email = 'pat.epee@gmail.com'
                    LIMIT 1),
                  false);

SELECT (current_setting('request.jwt.claims', true) IS NOT NULL)      AS identite_posee,
       auth.uid()                                                     AS uid,
       public.get_auth_role()                                         AS role_retourne,
       public.has_permission('sales:create')                          AS droit_vente,
       public.has_permission('code:inexistant')                       AS droit_inexistant,
       current_setting('search_path', true)                           AS search_path_session;

-- Lecture attendue : identite_posee = true, role_retourne = super_admin,
-- droit_vente = true, droit_inexistant = true (le role super_admin court-circuite la
-- comparaison de code dans le corps de has_permission : c est le dessin de 002, pas un bug),
-- search_path_session = la valeur du dashboard, INDEPENDANTE du search_path de la fonction
-- (c est exactement ce que l epinglage garantit : la fonction ne suit plus l appelant).
--
-- Ce que ce script ne prouve PAS : audit_trigger_func() ne peut pas etre appelee en SQL
-- (PostgreSQL refuse : « trigger functions can only be called as trigger »). Sa preuve
-- d execution apres 021 est reportee a la premiere ecriture sur une table auditee, par
-- exemple le flux reservation / vente en attente de GO.
