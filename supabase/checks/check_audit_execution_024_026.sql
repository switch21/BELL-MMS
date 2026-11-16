-- BELL-MMS -- Preuve d'EXECUTION des triggers d'audit des tables creees par 024, 025, 026.
-- Lecture seule : aucune ecriture, aucun set_config, aucune garde necessaire.
-- Ce que la migration certifie deja (apply_NNN_confirme.sql) : le trigger est BRANCHE et activable.
-- Ce que ce script cherche : une TRACE dans audit_logs, c'est-a-dire que le trigger a tourne pour
-- une ecriture reelle. Une table sans trace today reste NON EXERCREE : exercee=false n'est pas un
-- echec du trigger, c'est l'absence d'ecriture sur cette table.
-- Attente : la creation de tache faite depuis l'UI produite (POST /rest/v1/tasks -> 201, reference
-- TSK-2026-1DDF8EBF) doit rendre exercee=true sur 'tasks'. Les 6 autres tables restent a exercer.

WITH attendu(t) AS (
    VALUES ('tasks'), ('agenda_events'), ('work_projects'), ('work_project_steps'),
           ('tenders'), ('tender_documents'), ('tender_service_orders')
),
fenetre AS (
    SELECT a.entity_name, a.action, count(*) AS n, max(a.created_at) AS dernier
    FROM public.audit_logs a
    WHERE a.created_at >= now() - interval '12 hours'
      AND a.entity_name IN (SELECT t FROM attendu)
    GROUP BY a.entity_name, a.action
)
SELECT d.t AS table_auditee,
       COALESCE(SUM(CASE WHEN f.action = 'CREATE' THEN f.n END), 0) AS n_create,
       COALESCE(SUM(CASE WHEN f.action = 'UPDATE' THEN f.n END), 0) AS n_update,
       COALESCE(SUM(CASE WHEN f.action = 'DELETE' THEN f.n END), 0) AS n_delete,
       MAX(f.dernier)                                                AS dernier_evt,
       (COUNT(f.entity_name) > 0)                                    AS exercee
FROM attendu d
LEFT JOIN fenetre f ON f.entity_name = d.t
GROUP BY d.t
ORDER BY d.t;

-- Detail de la ligne exercee : prouve l'identite de l'acteur (auth.uid() resolu par le trigger en
-- SECURITY DEFINER) et que la trace correspond bien a l'ecriture de l'application, pas a un insert
-- manuel colle dans l editeur.
SELECT a.created_at,
       a.user_email,
       a.action,
       a.entity_name,
       a.new_values ->> 'reference' AS reference,
       left(a.new_values ->> 'title', 60) AS titre
FROM public.audit_logs a
WHERE a.entity_name = 'tasks'
  AND (a.new_values ->> 'reference' = 'TSK-2026-1DDF8EBF'
       OR a.old_values ->> 'reference' = 'TSK-2026-1DDF8EBF')
ORDER BY a.created_at;
