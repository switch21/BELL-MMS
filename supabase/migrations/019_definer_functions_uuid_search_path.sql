-- 019_definer_functions_uuid_search_path.sql
-- Correctif : les RPC SECURITY DEFINER fixent search_path = public, pg_temp.
-- uuid_generate_v4() vit dans le schema de l'extension uuid-ossp (hors public),
-- donc les appels non qualifies echouent en SQLSTATE 42883, expose par PostgREST
-- en 404. On ajoute le schema de l'extension au search_path des fonctions
-- concernees, sans modifier leur corps.
DO $$
DECLARE
    v_uuid_schema TEXT;
    v_function RECORD;
BEGIN
    SELECT n.nspname
      INTO v_uuid_schema
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'uuid_generate_v4'
       AND n.nspname <> 'pg_catalog'
     ORDER BY (n.nspname = 'extensions') DESC, n.nspname
     LIMIT 1;

    IF v_uuid_schema IS NULL THEN
        RAISE EXCEPTION 'uuid_generate_v4() introuvable : appliquer 019 est impossible.';
    END IF;

    FOR v_function IN
        SELECT p.oid::regprocedure AS signature
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (
               'create_reservation',
               'create_sale',
               'collect_sale_payment',
               'create_land_property',
               'create_expense_request',
               'disburse_expense_request',
               'create_financial_transfer',
               'close_cash_account',
               'record_owner_settlement_payment'
           )
    LOOP
        EXECUTE format(
            'ALTER FUNCTION %s SET search_path = public, %I, pg_temp',
            v_function.signature,
            v_uuid_schema
        );
        RAISE NOTICE 'search_path corrige : %', v_function.signature;
    END LOOP;
END
$$;

-- Verification : chaque fonction doit afficher public + schema de l'extension + pg_temp.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       array_to_string(p.proconfig, ',') AS configuration
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
       'create_reservation',
       'create_sale',
       'collect_sale_payment',
       'create_land_property',
       'create_expense_request',
       'disburse_expense_request',
       'create_financial_transfer',
       'close_cash_account',
       'record_owner_settlement_payment'
   )
 ORDER BY p.proname;
