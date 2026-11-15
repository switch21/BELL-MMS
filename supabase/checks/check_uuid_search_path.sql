-- Diagnostic LECTURE SEULE (2026-11-14) :
-- localiser uuid_generate_v4 et verifier le search_path des fonctions definisseur.
SELECT 1 AS ordre,
       'uuid_generate_v4 : schemas' AS controle,
       'au moins un schema hors public' AS attendu,
       coalesce((SELECT string_agg(n.nspname, ' | ' ORDER BY n.nspname)
                 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE p.proname = 'uuid_generate_v4'), 'ABSENTE') AS observe

UNION ALL

SELECT 2,
       'gen_random_uuid disponible',
       'pg_catalog.gen_random_uuid() resolvable',
       coalesce(to_regprocedure('pg_catalog.gen_random_uuid()')::text, 'ABSENTE')

UNION ALL

SELECT 3,
       'search_path des fonctions definisseur de workflow',
       'chaque fonction affiche sa configuration',
       coalesce((SELECT string_agg(p.proname || ' => ' || coalesce(array_to_string(p.proconfig, ','), '-'), ' | ' ORDER BY p.proname)
                 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND p.proname IN (
                     'create_land_property', 'create_land_plot',
                     'create_reservation', 'create_sale', 'collect_sale_payment',
                     'create_expense_request', 'decide_expense_request',
                     'disburse_expense_request', 'create_financial_transfer',
                     'close_cash_account', 'record_owner_settlement_payment'
                   )), 'AUCUNE')

UNION ALL

SELECT 4,
       'fonctions de workflow presentes',
       '11 attendues',
       (SELECT count(*)::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'create_land_property', 'create_land_plot',
            'create_reservation', 'create_sale', 'collect_sale_payment',
            'create_expense_request', 'decide_expense_request',
            'disburse_expense_request', 'create_financial_transfer',
            'close_cash_account', 'record_owner_settlement_payment'
          ));
