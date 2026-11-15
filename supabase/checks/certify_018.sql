-- Certification LECTURE SEULE de la migration 018 (log_login_event).
-- Aucune ecriture. A coller dans l'editeur SQL Supabase (owner).
-- Le premier resultat est le tableau controle / attendu / observe / statut.
-- Le second resultat liste les dernieres connexions journalisees (vide tant
-- qu'aucune connexion n'a eu lieu APRES l'application de la migration).

WITH checks AS (
  SELECT 1 AS ordre,
         '018 fonction log_login_event' AS controle,
         'existe, SECURITY DEFINER, plpgsql, search_path public/pg_temp, retour uuid' AS attendu,
         (SELECT coalesce(string_agg(
                   p.proname || ' / definer=' || p.prosecdef::text
                   || ' / lang=' || l.lanname
                   || ' / config=' || coalesce(array_to_string(p.proconfig, ','), '-')
                   || ' / retour=' || pg_get_function_result(p.oid),
                   ' | '), 'ABSENTE')
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE n.nspname = 'public' AND p.proname = 'log_login_event') AS observe,
         (SELECT count(*) = 1
                 AND bool_and(p.prosecdef)
                 AND bool_and(l.lanname = 'plpgsql')
                 AND bool_and(pg_get_function_result(p.oid) = 'uuid')
                 AND bool_and(coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=public, pg_temp%')
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE n.nspname = 'public' AND p.proname = 'log_login_event') AS ok

  UNION ALL
  SELECT 2,
         '018 privileges EXECUTE',
         'authenticated=true, anon=false, aucun droit PUBLIC (=X)',
         (SELECT 'auth=' || coalesce((
                   SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                   FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'log_login_event'
                   LIMIT 1), 'ABSENTE')
              || ' anon=' || coalesce((
                   SELECT has_function_privilege('anon', p.oid, 'EXECUTE')::text
                   FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'log_login_event'
                   LIMIT 1), 'ABSENTE')
              || ' public_acl=' || coalesce((
                   SELECT CASE WHEN EXISTS (
                            SELECT 1 FROM unnest(coalesce(p.proacl, '{}')) a
                            WHERE a::text LIKE '=X%'
                          ) THEN 'PRESENT' ELSE 'absent' END
                   FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'log_login_event'
                   LIMIT 1), 'ABSENTE')),
         (SELECT count(*) = 1
                 AND bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
                 AND NOT bool_and(has_function_privilege('anon', p.oid, 'EXECUTE'))
                 AND NOT bool_and(EXISTS (
                       SELECT 1 FROM unnest(coalesce(p.proacl, '{}')) a
                       WHERE a::text LIKE '=X%'
                     ))
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'log_login_event')

  UNION ALL
  SELECT 3,
         '018 identite et contenu du journal',
         'corps base sur auth.uid(), action LOGIN, module AUTH',
         (SELECT coalesce(string_agg(
                   'auth.uid=' || (position('auth.uid()' in pg_get_functiondef(p.oid)) > 0)::text
                   || ' / LOGIN=' || (position('''LOGIN''' in pg_get_functiondef(p.oid)) > 0)::text
                   || ' / AUTH=' || (position('''AUTH''' in pg_get_functiondef(p.oid)) > 0)::text
                   || ' / audit_logs=' || (position('audit_logs' in pg_get_functiondef(p.oid)) > 0)::text,
                   ' | '), 'ABSENTE')
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'log_login_event'),
         (SELECT count(*) = 1
                 AND bool_and(position('auth.uid()' in pg_get_functiondef(p.oid)) > 0)
                 AND bool_and(position('''LOGIN''' in pg_get_functiondef(p.oid)) > 0)
                 AND bool_and(position('''AUTH''' in pg_get_functiondef(p.oid)) > 0)
                 AND bool_and(position('audit_logs' in pg_get_functiondef(p.oid)) > 0)
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'log_login_event')
)
SELECT ordre,
       controle,
       attendu,
       observe,
       CASE WHEN ok THEN 'OK' ELSE 'ECART' END AS statut
FROM checks
UNION ALL
SELECT 99,
       'TOTAL',
       '3 controles',
       sum(CASE WHEN ok THEN 1 ELSE 0 END)::text || ' OK / ' || count(*)::text AS observe,
       CASE WHEN sum(CASE WHEN ok THEN 1 ELSE 0 END) = count(*) THEN 'OK' ELSE 'ECART' END
FROM checks
ORDER BY ordre;

-- Verification fonctionnelle : connexions journalisees apres l'application.
SELECT created_at, user_email, action, module, entity_name, new_values
FROM public.audit_logs
WHERE module = 'AUTH' AND action = 'LOGIN'
ORDER BY created_at DESC
LIMIT 5;
