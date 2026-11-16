-- BELL-MMS -- Grille d'EXECUTION des triggers d'audit des tables creees par 024, 025, 026.
-- Lecture seule : aucune ecriture, aucun set_config, aucune garde necessaire.
-- Ce que la migration certifie deja (apply_NNN_confirme.sql) : le trigger est BRANCHE et activable.
-- Ce que cette grille cherche : une TRACE dans audit_logs, c'est-a-dire que le trigger a tourne pour
-- une ecriture reelle. exercee=false n'est pas un echec du trigger : c'est l'absence d'ecriture sur
-- cette table dans la fenetre.
-- L'editeur SQL du tableau de bord ne rend que la DERNIERE instruction : cette grille est donc le
-- seul statement du fichier. Le detail par reference vit dans check_audit_detail.sql.
-- Controle du 2026-11-16 : le detail de ce fichier a rendu 2 lignes pour TSK-2026-1DDF8EBF (CREATE a
-- 06:07:17+00, UPDATE a 06:35:19+00, acteur pat.epee@gmail.com), ce qui recoupe /audit a la minute
-- pres avec le decalage local UTC+1.

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
