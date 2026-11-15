-- Application gardee du correctif 019 (a coller dans l'editeur SQL de l'owner).
-- Etape 1 : laisser 'non' et executer -> leve une exception, aucune ecriture.
-- Etape 2 : remplacer 'non' par 'oui' en premiere ligne, executer.
SELECT set_config('bell.confirme_019', 'non', false);

DO $$
BEGIN
    IF current_setting('bell.confirme_019', true) IS DISTINCT FROM 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_019 par oui.';
    END IF;
END
$$;

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
