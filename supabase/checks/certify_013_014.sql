-- Certification LECTURE SEULE des migrations 013 et 014.
-- Aucune ecriture : uniquement des SELECT sur les catalogues et les donnees.
-- A coller dans l'editeur SQL Supabase (owner). Le resultat attendu est un tableau
-- controle / attendu / observe / statut ; la derniere ligne donne le total.

WITH checks AS (
  SELECT 1 AS ordre,
         '013 role super_admin seede' AS controle,
         'role super_admin present' AS attendu,
         (SELECT coalesce(string_agg(code || ' / ' || name, ' | '), 'ABSENT')
          FROM public.roles WHERE code = 'super_admin') AS observe,
         (SELECT count(*) = 1 FROM public.roles WHERE code = 'super_admin') AS ok

  UNION ALL
  SELECT 2,
         '013 profil pat.epee@gmail.com',
         'compte auth + profil super_admin actif',
         (SELECT coalesce(string_agg(
                   u.email || ' / role=' || coalesce(r.code, 'ABSENT')
                   || ' / actif=' || coalesce(p.is_active::text, 'ABSENT'),
                   ' | '), 'aucun compte auth')
          FROM auth.users u
          LEFT JOIN public.profiles p ON p.id = u.id
          LEFT JOIN public.roles r ON r.id = p.role_id
          WHERE lower(u.email) = 'pat.epee@gmail.com'),
         (SELECT count(*) = 1
          FROM auth.users u
          JOIN public.profiles p ON p.id = u.id
          JOIN public.roles r ON r.id = p.role_id
          WHERE lower(u.email) = 'pat.epee@gmail.com'
            AND r.code = 'super_admin'
            AND p.is_active)

  UNION ALL
  SELECT 3,
         '014 policy INSERT land_properties',
         '1 policy INSERT, role authenticated, check land:write',
         (SELECT coalesce(string_agg(
                   policyname || ' / cmd=' || cmd
                   || ' / roles=' || array_to_string(roles, ',')
                   || ' / check=' || coalesce(with_check, '-'),
                   ' | '), 'ABSENTE')
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'land_properties'),
         (SELECT count(*) = 1
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'land_properties'
            AND policyname ILIKE 'Cr%ation des domaines fonciers autoris%e'
            AND cmd = 'INSERT'
            AND 'authenticated' = ANY(roles)
            AND coalesce(with_check, '') LIKE '%land:write%')

  UNION ALL
  SELECT 4,
         '014 fonction create_land_property',
         'existe, SECURITY DEFINER, search_path public/pg_temp, retour uuid',
         (SELECT coalesce(string_agg(
                   p.proname || ' / definer=' || p.prosecdef::text
                   || ' / config=' || coalesce(array_to_string(p.proconfig, ','), '-')
                   || ' / retour=' || pg_get_function_result(p.oid),
                   ' | '), 'ABSENTE')
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'create_land_property'),
         (SELECT count(*) = 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'create_land_property'
            AND p.prosecdef
            AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=public, pg_temp%')

  UNION ALL
  SELECT 5,
         '014 fonction create_land_plot',
         'existe, SECURITY DEFINER, search_path public/pg_temp, retour plots',
         (SELECT coalesce(string_agg(
                   p.proname || ' / definer=' || p.prosecdef::text
                   || ' / config=' || coalesce(array_to_string(p.proconfig, ','), '-')
                   || ' / retour=' || pg_get_function_result(p.oid),
                   ' | '), 'ABSENTE')
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'create_land_plot'),
         (SELECT count(*) = 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'create_land_plot'
            AND p.prosecdef
            AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=public, pg_temp%')

  UNION ALL
  SELECT 6,
         '014 privileges EXECUTE',
         'authenticated=true et anon=false sur les 2 fonctions',
         (SELECT 'property auth=' || coalesce((
                   CASE WHEN to_regprocedure('public.create_land_property(varchar,varchar,varchar,varchar,varchar,numeric,numeric,numeric,numeric)') IS NULL
                        THEN 'ABSENTE'
                        ELSE has_function_privilege('authenticated', to_regprocedure('public.create_land_property(varchar,varchar,varchar,varchar,varchar,numeric,numeric,numeric,numeric)'), 'EXECUTE')::text
                   END), '?')
              || ' anon=' || coalesce((
                   CASE WHEN to_regprocedure('public.create_land_property(varchar,varchar,varchar,varchar,varchar,numeric,numeric,numeric,numeric)') IS NULL
                        THEN 'ABSENTE'
                        ELSE has_function_privilege('anon', to_regprocedure('public.create_land_property(varchar,varchar,varchar,varchar,varchar,numeric,numeric,numeric,numeric)'), 'EXECUTE')::text
                   END), '?')
              || ' | plot auth=' || coalesce((
                   CASE WHEN to_regprocedure('public.create_land_plot(uuid,uuid,varchar,numeric,numeric,numeric,numeric,numeric,numeric,text)') IS NULL
                        THEN 'ABSENTE'
                        ELSE has_function_privilege('authenticated', to_regprocedure('public.create_land_plot(uuid,uuid,varchar,numeric,numeric,numeric,numeric,numeric,numeric,text)'), 'EXECUTE')::text
                   END), '?')
              || ' anon=' || coalesce((
                   CASE WHEN to_regprocedure('public.create_land_plot(uuid,uuid,varchar,numeric,numeric,numeric,numeric,numeric,numeric,text)') IS NULL
                        THEN 'ABSENTE'
                        ELSE has_function_privilege('anon', to_regprocedure('public.create_land_plot(uuid,uuid,varchar,numeric,numeric,numeric,numeric,numeric,numeric,text)'), 'EXECUTE')::text
                   END), '?')),
         (coalesce((
            CASE WHEN to_regprocedure('public.create_land_property(varchar,varchar,varchar,varchar,varchar,numeric,numeric,numeric,numeric)') IS NULL
                 THEN false
                 ELSE has_function_privilege('authenticated', to_regprocedure('public.create_land_property(varchar,varchar,varchar,varchar,varchar,numeric,numeric,numeric,numeric)'), 'EXECUTE')
            END), false)
          AND NOT coalesce((
            CASE WHEN to_regprocedure('public.create_land_property(varchar,varchar,varchar,varchar,varchar,numeric,numeric,numeric,numeric)') IS NULL
                 THEN true
                 ELSE has_function_privilege('anon', to_regprocedure('public.create_land_property(varchar,varchar,varchar,varchar,varchar,numeric,numeric,numeric,numeric)'), 'EXECUTE')
            END), true)
          AND coalesce((
            CASE WHEN to_regprocedure('public.create_land_plot(uuid,uuid,varchar,numeric,numeric,numeric,numeric,numeric,numeric,text)') IS NULL
                 THEN false
                 ELSE has_function_privilege('authenticated', to_regprocedure('public.create_land_plot(uuid,uuid,varchar,numeric,numeric,numeric,numeric,numeric,numeric,text)'), 'EXECUTE')
            END), false)
          AND NOT coalesce((
            CASE WHEN to_regprocedure('public.create_land_plot(uuid,uuid,varchar,numeric,numeric,numeric,numeric,numeric,numeric,text)') IS NULL
                 THEN true
                 ELSE has_function_privilege('anon', to_regprocedure('public.create_land_plot(uuid,uuid,varchar,numeric,numeric,numeric,numeric,numeric,numeric,text)'), 'EXECUTE')
            END), true))

  UNION ALL
  SELECT 7,
         '014 triggers audit land',
         '3 triggers actifs (O) sur land_properties, subdivisions, blocks',
         (SELECT coalesce(string_agg(t.tgname || ':' || t.tgenabled::text, ' | '), 'ABSENTS')
          FROM pg_trigger t
          WHERE NOT t.tgisinternal
            AND t.tgname IN ('trg_audit_land_properties', 'trg_audit_subdivisions', 'trg_audit_blocks')),
         (SELECT count(*) = 3
          FROM pg_trigger t
          WHERE NOT t.tgisinternal
            AND t.tgname IN ('trg_audit_land_properties', 'trg_audit_subdivisions', 'trg_audit_blocks')
            AND t.tgenabled = 'O')

  UNION ALL
  SELECT 8,
         '014 fonction audit_trigger_func',
         'existe dans public',
         (SELECT coalesce(string_agg(
                   p.proname || ' / definer=' || p.prosecdef::text
                   || ' / config=' || coalesce(array_to_string(p.proconfig, ','), '-'), ' | '),
                   'ABSENTE')
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'audit_trigger_func'),
         (SELECT count(*) = 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'audit_trigger_func')
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
       '8 controles',
       sum(CASE WHEN ok THEN 1 ELSE 0 END)::text || ' OK / ' || count(*)::text AS observe,
       CASE WHEN sum(CASE WHEN ok THEN 1 ELSE 0 END) = count(*) THEN 'OK' ELSE 'ECART' END
FROM checks
ORDER BY ordre;
