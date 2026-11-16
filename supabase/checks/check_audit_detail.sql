-- BELL-MMS -- Detail des traces d'audit laissee par les ecritures de l'application (024/025/026).
-- Lecture seule. Compagne de check_audit_execution_024_026.sql (la grille), qui doit rester le
-- dernier statement de son fichier : l'editeur SQL du tableau de bord ne rend qu'un seul resultset.
-- Tout se lit dans new_values : c'est la capture JSONB faite par le trigger, donc une reference
-- absente d une table rend NULL et non une erreur de colonne inexistante.
-- Premiere joue le 2026-11-16 : 2 lignes pour TSK-2026-1DDF8EBF, CREATE a 06:07:17+00 et UPDATE a
-- 06:35:19+00, acteur pat.epee@gmail.com -- a recouper avec /audit, qui affiche la meme heure en
-- locale (UTC+1).

SELECT a.created_at,
       a.user_email,
       a.action,
       a.entity_name,
       a.entity_id,
       a.new_values ->> 'reference'               AS reference,
       left(COALESCE(a.new_values ->> 'title', '') , 60) AS titre
FROM public.audit_logs a
WHERE a.created_at >= now() - interval '12 hours'
  AND a.entity_name IN ('tasks', 'agenda_events', 'work_projects', 'work_project_steps',
                        'tenders', 'tender_documents', 'tender_service_orders')
ORDER BY a.created_at DESC
LIMIT 40;
