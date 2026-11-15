-- Verification LECTURE SEULE du chemin reel des connexions (migration 018).
-- A executer APRES une deconnexion/reconnexion sur le bundle 8ea1d1e.
-- Attendu : au moins une ligne LOGIN / AUTH / session avec
-- new_values.source = 'supabase-auth'.

SELECT created_at, user_email, action, module, entity_name, new_values
FROM public.audit_logs
WHERE module = 'AUTH' AND action = 'LOGIN'
ORDER BY created_at DESC
LIMIT 5;
