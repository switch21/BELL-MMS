-- Meme contenu que supabase/migrations/020_use_gen_random_uuid.sql, avec le garde-fou
-- de confirmation pour un collage dans l'editeur SQL du tableau de bord.
-- Les ecrites ne partent que si bell.confirme_020 vaut 'oui'.

SELECT set_config('bell.confirme_020', 'non', false);

DO $$
BEGIN
    IF coalesce(current_setting('bell.confirme_020', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_020 par oui.';
    END IF;
END
$$;
-- 020 : gen_random_uuid() a la place de uuid_generate_v4() dans les 9 fonctions de workflow
-- Cause racine constatee en production : uuid-ossp vit dans le schema d'extension,
-- donc un corps SECURITY DEFINER avec search_path = public, pg_temp echouait en
-- 42883 (« function uuid_generate_v4() does not exist »), remappe en 404 par PostgREST.
-- 019 a EpINGLE le search_path des 9 fonctions ; ce fichier supprime la dependance :
-- gen_random_uuid() reside en pg_catalog et reste resolvable quel que soit le search_path.
-- Derive constatee : create_reservation, create_sale et collect_sale_payment utilisaient
-- deja gen_random_uuid() en production, sans reflet dans les migrations. Ce fichier
-- aligne le depot sur la production reelle.
-- Corps repris a l'identique des migrations d'origine, seul le generateur d'identifiant change.

BEGIN;

-- create_reservation  (source : 009_atomic_sales_workflows.sql, 1 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.create_reservation(
    p_client_id UUID,
    p_plot_id UUID,
    p_deposit_amount NUMERIC,
    p_duration_days INTEGER,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_plot public.plots%ROWTYPE;
    v_reservation public.reservations%ROWTYPE;
    v_today DATE := CURRENT_DATE;
BEGIN
    IF NOT public.has_permission('sales:create') THEN
        RAISE EXCEPTION 'Permission refusée pour créer une réservation.' USING ERRCODE = '42501';
    END IF;

    IF p_duration_days < 1 OR p_deposit_amount < 0 THEN
        RAISE EXCEPTION 'La durée doit être positive et l''acompte ne peut pas être négatif.';
    END IF;

    SELECT * INTO v_plot
    FROM public.plots
    WHERE id = p_plot_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcelle introuvable.';
    END IF;

    IF v_plot.status <> 'disponible' THEN
        RAISE EXCEPTION 'La parcelle n''est plus disponible.';
    END IF;

    IF p_deposit_amount > v_plot.area_sqm * v_plot.price_per_sqm THEN
        RAISE EXCEPTION 'L''acompte dépasse le prix de la parcelle.';
    END IF;

    INSERT INTO public.reservations (
        reference, client_id, plot_id, agreed_price, deposit_amount,
        reservation_date, duration_days, expiration_date, status,
        sales_rep_id, notes
    )
    VALUES (
        'RES-' || EXTRACT(YEAR FROM v_today)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
        p_client_id, p_plot_id, v_plot.area_sqm * v_plot.price_per_sqm, p_deposit_amount,
        v_today, p_duration_days, v_today + p_duration_days, 'active',
        auth.uid(), p_notes
    )
    RETURNING * INTO v_reservation;

    UPDATE public.plots SET status = 'reservee', updated_at = NOW()
    WHERE id = p_plot_id;

    INSERT INTO public.plot_status_history (plot_id, old_status, new_status, reason, changed_by)
    VALUES (p_plot_id, v_plot.status, 'reservee', 'Réservation ' || v_reservation.reference, auth.uid());

    RETURN v_reservation;
END;
$$;

-- create_sale  (source : 009_atomic_sales_workflows.sql, 2 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.create_sale(
    p_client_id UUID,
    p_plot_id UUID,
    p_sale_type VARCHAR,
    p_initial_deposit NUMERIC,
    p_payment_method VARCHAR,
    p_installments_count INTEGER DEFAULT 0,
    p_reservation_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_plot public.plots%ROWTYPE;
    v_reservation public.reservations%ROWTYPE;
    v_sale public.sales%ROWTYPE;
    v_price NUMERIC(15, 2);
    v_balance NUMERIC(15, 2);
    v_installment NUMERIC(15, 2);
    v_due_date DATE;
    v_i INTEGER;
    v_status VARCHAR(50);
    v_sale_date DATE := CURRENT_DATE;
BEGIN
    IF NOT public.has_permission('sales:create') THEN
        RAISE EXCEPTION 'Permission refusée pour créer une vente.' USING ERRCODE = '42501';
    END IF;

    IF p_sale_type NOT IN ('comptant', 'echelonne')
       OR p_payment_method NOT IN ('virement', 'cheque', 'versement_bancaire', 'especes') THEN
        RAISE EXCEPTION 'Type de vente ou mode de paiement invalide.';
    END IF;

    IF p_initial_deposit < 0 THEN
        RAISE EXCEPTION 'L''acompte ne peut pas être négatif.';
    END IF;

    IF p_sale_type = 'echelonne' AND p_installments_count NOT IN (3, 6, 12, 18, 24) THEN
        RAISE EXCEPTION 'Nombre d''échéances invalide.';
    END IF;

    SELECT * INTO v_plot
    FROM public.plots
    WHERE id = p_plot_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcelle introuvable.';
    END IF;

    IF p_reservation_id IS NOT NULL THEN
        SELECT * INTO v_reservation
        FROM public.reservations
        WHERE id = p_reservation_id
        FOR UPDATE;

        IF NOT FOUND
           OR v_reservation.plot_id <> p_plot_id
           OR v_reservation.client_id <> p_client_id
           OR v_reservation.status <> 'active'
           OR v_reservation.expiration_date < v_sale_date THEN
            RAISE EXCEPTION 'La réservation est invalide, expirée ou ne correspond pas à cette vente.';
        END IF;
    ELSIF v_plot.status <> 'disponible' THEN
        RAISE EXCEPTION 'La parcelle n''est plus disponible; une réservation valide est nécessaire.';
    END IF;

    v_price := v_plot.area_sqm * v_plot.price_per_sqm;
    IF p_initial_deposit > v_price THEN
        RAISE EXCEPTION 'L''acompte dépasse le prix de la parcelle.';
    END IF;
    IF p_sale_type = 'comptant' AND p_initial_deposit <> v_price THEN
        RAISE EXCEPTION 'Une vente au comptant doit être réglée intégralement.';
    END IF;

    v_balance := v_price - p_initial_deposit;
    v_status := CASE WHEN v_balance = 0 THEN 'soldee' ELSE 'en_cours' END;

    INSERT INTO public.sales (
        reference, client_id, plot_id, reservation_id, sale_type, sale_date,
        total_price, discount_amount, final_price, initial_deposit,
        remaining_balance, payment_method, status, sales_rep_id, notes
    )
    VALUES (
        'VTE-' || EXTRACT(YEAR FROM v_sale_date)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
        p_client_id, p_plot_id, p_reservation_id, p_sale_type, v_sale_date,
        v_price, 0, v_price, p_initial_deposit, v_balance, p_payment_method,
        v_status, auth.uid(), p_notes
    )
    RETURNING * INTO v_sale;

    IF v_balance > 0 THEN
        v_installment := ROUND(v_balance / p_installments_count, 2);
        FOR v_i IN 1..p_installments_count LOOP
            v_due_date := (v_sale_date + make_interval(months => v_i))::DATE;
            INSERT INTO public.payment_schedules (
                sale_id, installment_number, due_date, due_amount
            )
            VALUES (
                v_sale.id,
                v_i,
                v_due_date,
                CASE WHEN v_i = p_installments_count
                    THEN v_balance - v_installment * (p_installments_count - 1)
                    ELSE v_installment
                END
            );
        END LOOP;
    END IF;

    IF p_initial_deposit > 0 THEN
        INSERT INTO public.receipts (
            reference, sale_id, amount, payment_date, payment_method, received_by, notes
        )
        VALUES (
            'REC-' || EXTRACT(YEAR FROM v_sale_date)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
            v_sale.id, p_initial_deposit, v_sale_date, p_payment_method, auth.uid(),
            CASE WHEN p_sale_type = 'comptant' THEN 'Règlement total au comptant' ELSE 'Acompte initial de vente échelonnée' END
        );
    END IF;

    UPDATE public.plots SET status = 'vendue', updated_at = NOW()
    WHERE id = p_plot_id;

    INSERT INTO public.plot_status_history (plot_id, old_status, new_status, reason, changed_by)
    VALUES (p_plot_id, v_plot.status, 'vendue', 'Vente ' || v_sale.reference, auth.uid());

    IF p_reservation_id IS NOT NULL THEN
        UPDATE public.reservations
        SET status = 'transformee_en_vente', updated_at = NOW()
        WHERE id = p_reservation_id;
    END IF;

    RETURN v_sale;
END;
$$;

-- collect_sale_payment  (source : 009_atomic_sales_workflows.sql, 1 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.collect_sale_payment(
    p_sale_id UUID,
    p_amount NUMERIC,
    p_payment_method VARCHAR,
    p_transaction_ref TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale public.sales%ROWTYPE;
    v_receipt public.receipts%ROWTYPE;
    v_due NUMERIC(15, 2);
    v_remaining NUMERIC(15, 2) := p_amount;
    v_schedule public.payment_schedules%ROWTYPE;
    v_today DATE := CURRENT_DATE;
BEGIN
    IF NOT public.has_permission('sales:create') THEN
        RAISE EXCEPTION 'Permission refusée pour encaisser un paiement.' USING ERRCODE = '42501';
    END IF;

    IF p_amount <= 0
       OR p_payment_method NOT IN ('virement', 'cheque', 'versement_bancaire', 'especes') THEN
        RAISE EXCEPTION 'Montant ou mode de paiement invalide.';
    END IF;

    SELECT * INTO v_sale
    FROM public.sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND OR v_sale.status = 'annulee' THEN
        RAISE EXCEPTION 'Vente introuvable ou annulée.';
    END IF;

    IF p_amount > v_sale.remaining_balance THEN
        RAISE EXCEPTION 'Le paiement dépasse le solde restant dû.';
    END IF;

    INSERT INTO public.receipts (
        reference, sale_id, amount, payment_date, payment_method, transaction_ref,
        received_by, notes
    )
    VALUES (
        'REC-' || EXTRACT(YEAR FROM v_today)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
        v_sale.id, p_amount, v_today, p_payment_method, p_transaction_ref, auth.uid(), p_notes
    )
    RETURNING * INTO v_receipt;

    FOR v_schedule IN
        SELECT * FROM public.payment_schedules
        WHERE sale_id = p_sale_id AND paid_amount < due_amount
        ORDER BY installment_number
        FOR UPDATE
    LOOP
        EXIT WHEN v_remaining <= 0;
        v_due := LEAST(v_remaining, v_schedule.due_amount - v_schedule.paid_amount);
        UPDATE public.payment_schedules
        SET paid_amount = paid_amount + v_due,
            status = CASE
                WHEN paid_amount + v_due >= due_amount THEN 'paye'
                ELSE 'partiel'
            END,
            paid_at = CASE
                WHEN paid_amount + v_due >= due_amount THEN NOW()
                ELSE paid_at
            END,
            receipt_reference = v_receipt.reference
        WHERE id = v_schedule.id;
        v_remaining := v_remaining - v_due;
    END LOOP;

    UPDATE public.sales
    SET remaining_balance = remaining_balance - p_amount,
        status = CASE WHEN remaining_balance - p_amount = 0 THEN 'soldee' ELSE status END,
        updated_at = NOW()
    WHERE id = p_sale_id;

    RETURN v_receipt;
END;
$$;

-- create_land_property  (source : 014_land_workflows.sql, 1 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.create_land_property(
    p_reference VARCHAR,
    p_designation VARCHAR,
    p_ownership_type VARCHAR,
    p_land_title_number VARCHAR,
    p_locality VARCHAR,
    p_total_area_sqm NUMERIC,
    p_purchase_price NUMERIC,
    p_latitude NUMERIC,
    p_longitude NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_land_id UUID;
    v_subdivision_id UUID;
    v_subdivision_reference VARCHAR;
BEGIN
    IF NOT public.has_permission('land:write') THEN
        RAISE EXCEPTION 'Permission refusée pour créer un domaine foncier.' USING ERRCODE = '42501';
    END IF;

    IF p_total_area_sqm <= 0 OR p_ownership_type NOT IN ('entreprise', 'tiers_mandat') THEN
        RAISE EXCEPTION 'Superficie ou nature de propriété invalide.';
    END IF;

    INSERT INTO public.land_properties (
        reference, designation, ownership_type, land_title_number, locality,
        total_area_sqm, purchase_price, latitude, longitude
    )
    VALUES (
        p_reference, p_designation, p_ownership_type, p_land_title_number,
        p_locality, p_total_area_sqm, p_purchase_price, p_latitude, p_longitude
    )
    RETURNING id INTO v_land_id;

    v_subdivision_reference :=
        'LOT-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-'
        || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8));

    INSERT INTO public.subdivisions (
        land_property_id, reference, name, total_area_sqm, status
    )
    VALUES (
        v_land_id, v_subdivision_reference, p_designation, p_total_area_sqm, 'en_cours'
    )
    RETURNING id INTO v_subdivision_id;

    INSERT INTO public.blocks (subdivision_id, name)
    VALUES (v_subdivision_id, 'Bloc A');

    RETURN v_land_id;
END;
$$;

-- create_expense_request  (source : 016_finance_workflows.sql, 1 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.create_expense_request(
    p_category_code VARCHAR,
    p_account_id UUID,
    p_beneficiary VARCHAR,
    p_amount NUMERIC,
    p_description TEXT,
    p_expense_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.expense_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_threshold NUMERIC(15, 2);
    v_expense public.expense_requests%ROWTYPE;
    v_date DATE := COALESCE(p_expense_date, CURRENT_DATE);
BEGIN
    IF NOT public.has_permission('finance:expense:request') THEN
        RAISE EXCEPTION 'Permission refusée pour demander une dépense.' USING ERRCODE = '42501';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant de la dépense doit être strictement positif.';
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_beneficiary, '')), '') IS NULL
       OR NULLIF(BTRIM(COALESCE(p_description, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Le bénéficiaire et le motif de la dépense sont obligatoires.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.financial_accounts
        WHERE id = p_account_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Compte à débiter introuvable ou inactif.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.financial_categories
        WHERE code = p_category_code AND category_type = 'depense' AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Catégorie de dépense invalide.';
    END IF;

    SELECT COALESCE(expense_approval_threshold_dg, 250000)
    INTO v_threshold
    FROM public.app_settings
    WHERE id = 'current';
    v_threshold := COALESCE(v_threshold, 250000);

    INSERT INTO public.expense_requests (
        reference, category_code, account_id, beneficiary, amount, expense_date,
        description, requested_by, requested_by_name, requires_dg_approval, status
    )
    VALUES (
        'DEP-' || TO_CHAR(v_date, 'YYYY') || '-'
            || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 6)),
        p_category_code, p_account_id, BTRIM(p_beneficiary), p_amount, v_date,
        BTRIM(p_description), auth.uid(), COALESCE(public.current_profile_name(), 'Demandeur'),
        p_amount > v_threshold, 'en_attente'
    )
    RETURNING * INTO v_expense;

    RETURN v_expense;
END;
$$;

-- disburse_expense_request  (source : 016_finance_workflows.sql, 1 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.disburse_expense_request(p_expense_id UUID)
RETURNS public.financial_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expense public.expense_requests%ROWTYPE;
    v_account public.financial_accounts%ROWTYPE;
    v_new_balance NUMERIC(15, 2);
    v_transaction public.financial_transactions%ROWTYPE;
BEGIN
    IF NOT (
        public.has_permission('finance:cash:manage')
        OR public.has_permission('finance:expense:approve')
        OR public.get_auth_role() IN ('directeur_general', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Permission refusée pour décaisser une dépense.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_expense
    FROM public.expense_requests
    WHERE id = p_expense_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Demande de dépense introuvable.';
    END IF;

    IF v_expense.status <> 'approuve' THEN
        RAISE EXCEPTION 'Seule une dépense approuvée peut être décaissée (statut %).', v_expense.status;
    END IF;

    SELECT * INTO v_account
    FROM public.financial_accounts
    WHERE id = v_expense.account_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_account.is_active THEN
        RAISE EXCEPTION 'Compte à débiter introuvable ou inactif.';
    END IF;

    IF v_account.current_balance < v_expense.amount THEN
        RAISE EXCEPTION 'Solde insuffisant sur % : disponible %, demandé %.',
            v_account.name, v_account.current_balance, v_expense.amount;
    END IF;

    v_new_balance := v_account.current_balance - v_expense.amount;

    UPDATE public.financial_accounts
    SET current_balance = v_new_balance, updated_at = NOW()
    WHERE id = v_account.id;

    UPDATE public.expense_requests
    SET status = 'decaisse', disbursed_at = NOW(), updated_at = NOW()
    WHERE id = p_expense_id;

    INSERT INTO public.financial_transactions (
        reference, account_id, transaction_type, category_code, amount, transaction_date,
        beneficiary_or_payer, description, related_entity_type, related_entity_id,
        balance_after, created_by, created_by_name
    )
    VALUES (
        'TRX-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-'
            || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 6)),
        v_account.id, 'depense', v_expense.category_code, v_expense.amount, CURRENT_DATE,
        v_expense.beneficiary,
        'Règlement dépense : ' || v_expense.description || ' (' || v_expense.reference || ')',
        'expense', v_expense.id::TEXT,
        v_new_balance, auth.uid(), COALESCE(public.current_profile_name(), 'Caisse')
    )
    RETURNING * INTO v_transaction;

    RETURN v_transaction;
END;
$$;

-- create_financial_transfer  (source : 016_finance_workflows.sql, 1 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.create_financial_transfer(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount NUMERIC,
    p_reason TEXT
)
RETURNS public.financial_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_from public.financial_accounts%ROWTYPE;
    v_to public.financial_accounts%ROWTYPE;
    v_transfer public.financial_transfers%ROWTYPE;
    v_reference VARCHAR(50);
    v_new_from NUMERIC(15, 2);
    v_new_to NUMERIC(15, 2);
    v_operator VARCHAR(200);
BEGIN
    IF NOT (
        public.has_permission('finance:cash:manage')
        OR public.get_auth_role() IN ('directeur_general', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Permission refusée pour transférer des fonds.' USING ERRCODE = '42501';
    END IF;

    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'Le compte source et le compte destinataire doivent être distincts.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant du transfert doit être strictement positif.';
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Le motif du transfert est obligatoire.';
    END IF;

    -- Verrouillage déterministe pour éviter tout interblocage entre transferts croisés
    PERFORM 1
    FROM public.financial_accounts
    WHERE id IN (p_from_account_id, p_to_account_id)
    ORDER BY id
    FOR UPDATE;

    SELECT * INTO v_from FROM public.financial_accounts WHERE id = p_from_account_id;
    IF NOT FOUND OR NOT v_from.is_active THEN
        RAISE EXCEPTION 'Compte source introuvable ou inactif.';
    END IF;

    SELECT * INTO v_to FROM public.financial_accounts WHERE id = p_to_account_id;
    IF NOT FOUND OR NOT v_to.is_active THEN
        RAISE EXCEPTION 'Compte destinataire introuvable ou inactif.';
    END IF;

    IF v_from.current_balance < p_amount THEN
        RAISE EXCEPTION 'Solde insuffisant sur % : disponible %.', v_from.name, v_from.current_balance;
    END IF;

    v_new_from := v_from.current_balance - p_amount;
    v_new_to := v_to.current_balance + p_amount;
    v_operator := COALESCE(public.current_profile_name(), 'Direction');
    v_reference := 'TRF-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-'
        || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 6));

    UPDATE public.financial_accounts
    SET current_balance = v_new_from, updated_at = NOW()
    WHERE id = v_from.id;

    UPDATE public.financial_accounts
    SET current_balance = v_new_to, updated_at = NOW()
    WHERE id = v_to.id;

    INSERT INTO public.financial_transfers (
        reference, from_account_id, to_account_id, amount, transfer_date, reason,
        initiated_by, from_account_name, to_account_name, initiated_by_name
    )
    VALUES (
        v_reference, v_from.id, v_to.id, p_amount, CURRENT_DATE, BTRIM(p_reason),
        auth.uid(), v_from.name, v_to.name, v_operator
    )
    RETURNING * INTO v_transfer;

    INSERT INTO public.financial_transactions (
        reference, account_id, transaction_type, amount, transaction_date,
        beneficiary_or_payer, description, related_entity_type, related_entity_id,
        balance_after, created_by, created_by_name
    )
    VALUES
    (
        v_reference || '-D', v_from.id, 'transfert_debit', p_amount, CURRENT_DATE,
        v_to.name, 'Transfert émis vers ' || v_to.name || ' : ' || BTRIM(p_reason),
        'transfer', v_transfer.id::TEXT, v_new_from, auth.uid(), v_operator
    ),
    (
        v_reference || '-C', v_to.id, 'transfert_credit', p_amount, CURRENT_DATE,
        v_from.name, 'Transfert reçu de ' || v_from.name || ' : ' || BTRIM(p_reason),
        'transfer', v_transfer.id::TEXT, v_new_to, auth.uid(), v_operator
    );

    RETURN v_transfer;
END;
$$;

-- close_cash_account  (source : 016_finance_workflows.sql, 1 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.close_cash_account(
    p_account_id UUID,
    p_physical_count NUMERIC,
    p_explanation TEXT DEFAULT NULL
)
RETURNS public.cash_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account public.financial_accounts%ROWTYPE;
    v_closure public.cash_closures%ROWTYPE;
    v_inflow NUMERIC(15, 2);
    v_outflow NUMERIC(15, 2);
    v_theoretical NUMERIC(15, 2);
    v_discrepancy NUMERIC(15, 2);
BEGIN
    IF NOT (
        public.has_permission('finance:cash:manage')
        OR public.get_auth_role() IN ('directeur_general', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Permission refusée pour clôturer une caisse.' USING ERRCODE = '42501';
    END IF;

    IF p_physical_count IS NULL OR p_physical_count < 0 THEN
        RAISE EXCEPTION 'Le comptage physique doit être un montant positif ou nul.';
    END IF;

    SELECT * INTO v_account
    FROM public.financial_accounts
    WHERE id = p_account_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caisse introuvable ou inactive.';
    END IF;

    IF v_account.account_type <> 'caisse' THEN
        RAISE EXCEPTION 'Seules les caisses physiques peuvent être clôturées.';
    END IF;

    v_theoretical := v_account.current_balance;
    v_discrepancy := p_physical_count - v_theoretical;

    IF v_discrepancy <> 0 AND NULLIF(BTRIM(COALESCE(p_explanation, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Un écart de % FCFA exige une justification écrite.', v_discrepancy;
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN transaction_type IN ('recette', 'transfert_credit') THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN transaction_type IN ('depense', 'transfert_debit') THEN amount ELSE 0 END), 0)
    INTO v_inflow, v_outflow
    FROM public.financial_transactions
    WHERE account_id = p_account_id AND transaction_date = CURRENT_DATE;

    INSERT INTO public.cash_closures (
        reference, account_id, closure_date, opening_balance, total_inflow, total_outflow,
        theoretical_balance, physical_count_balance, discrepancy_explanation,
        closed_by, status, account_name, closed_by_name
    )
    VALUES (
        'CLO-' || TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') || '-' || v_account.code || '-'
            || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 4)),
        v_account.id, CURRENT_DATE, v_theoretical - v_inflow + v_outflow, v_inflow, v_outflow,
        v_theoretical, p_physical_count,
        COALESCE(NULLIF(BTRIM(COALESCE(p_explanation, '')), ''), 'Comptage physique conforme au solde théorique.'),
        auth.uid(), 'validee', v_account.name, COALESCE(public.current_profile_name(), 'Responsable Caisse')
    )
    RETURNING * INTO v_closure;

    RETURN v_closure;
END;
$$;

-- record_owner_settlement_payment  (source : 017_third_party_settlement_payments.sql, 1 appel(s) uuid-ossp remplace(s))
CREATE OR REPLACE FUNCTION public.record_owner_settlement_payment(
    p_settlement_id UUID,
    p_account_id UUID,
    p_amount NUMERIC,
    p_proof_ref TEXT
)
RETURNS public.third_party_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settlement public.third_party_settlements%ROWTYPE;
    v_account public.financial_accounts%ROWTYPE;
    v_partner_name VARCHAR(200);
    v_new_paid NUMERIC(15, 2);
    v_new_balance NUMERIC(15, 2);
    v_new_status VARCHAR(50);
    v_new_account_balance NUMERIC(15, 2);
BEGIN
    IF NOT (
        public.has_permission('finance:cash:manage')
        OR public.get_auth_role() IN ('directeur_general', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Permission refusée pour enregistrer un reversement propriétaire.' USING ERRCODE = '42501';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant du reversement doit être strictement positif.';
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_proof_ref, '')), '') IS NULL THEN
        RAISE EXCEPTION 'La référence du justificatif de paiement est obligatoire.';
    END IF;

    SELECT * INTO v_settlement
    FROM public.third_party_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reversement propriétaire introuvable.';
    END IF;

    IF v_settlement.status = 'solde' OR v_settlement.balance_due_to_owner <= 0 THEN
        RAISE EXCEPTION 'Ce reversement est déjà soldé.';
    END IF;

    IF p_amount > v_settlement.balance_due_to_owner THEN
        RAISE EXCEPTION 'Le montant dépasse le solde dû au propriétaire (%).',
            v_settlement.balance_due_to_owner;
    END IF;

    SELECT * INTO v_account
    FROM public.financial_accounts
    WHERE id = p_account_id
    FOR UPDATE;

    IF NOT FOUND OR NOT v_account.is_active THEN
        RAISE EXCEPTION 'Compte de trésorerie introuvable ou inactif.';
    END IF;

    IF v_account.current_balance < p_amount THEN
        RAISE EXCEPTION 'Solde insuffisant sur % : disponible %, demandé %.',
            v_account.name, v_account.current_balance, p_amount;
    END IF;

    SELECT name INTO v_partner_name
    FROM public.partners
    WHERE id = v_settlement.partner_id;

    v_new_paid := v_settlement.amount_paid_to_owner + p_amount;
    v_new_balance := v_settlement.owner_base_amount - v_new_paid;
    v_new_status := CASE WHEN v_new_balance <= 0 THEN 'solde' ELSE 'partiellement_paye' END;
    v_new_account_balance := v_account.current_balance - p_amount;

    UPDATE public.financial_accounts
    SET current_balance = v_new_account_balance, updated_at = NOW()
    WHERE id = v_account.id;

    UPDATE public.third_party_settlements
    SET amount_paid_to_owner = v_new_paid,
        balance_due_to_owner = v_new_balance,
        status = v_new_status,
        settlement_date = CURRENT_DATE,
        payment_proof_ref = BTRIM(p_proof_ref),
        updated_at = NOW()
    WHERE id = p_settlement_id
    RETURNING * INTO v_settlement;

    INSERT INTO public.financial_transactions (
        reference, account_id, transaction_type, category_code, amount, transaction_date,
        beneficiary_or_payer, description, related_entity_type, related_entity_id,
        balance_after, created_by, created_by_name
    )
    VALUES (
        'TRX-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-'
            || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 6)),
        v_account.id, 'depense', 'dep_reversement_proprietaire', p_amount, CURRENT_DATE,
        COALESCE(v_partner_name, 'Propriétaire tiers'),
        'Reversement propriétaire : ' || v_settlement.reference || ' (' || BTRIM(p_proof_ref) || ')',
        'settlement', v_settlement.id::TEXT,
        v_new_account_balance, auth.uid(), COALESCE(public.current_profile_name(), 'Direction')
    );

    RETURN v_settlement;
END;
$$;

-- Garde-fou : aucune de ces fonctions ne doit devenir une surcharge.
-- CREATE OR REPLACE cree un doublon si la signature a derive ; on le detecte ici,
-- avant COMMIT, donc la transaction complete est annulee.
DO $$
DECLARE
    v_nom TEXT;
    v_nb INT;
BEGIN
    FOREACH v_nom IN ARRAY ARRAY['create_reservation', 'create_sale', 'collect_sale_payment', 'create_land_property', 'create_expense_request', 'disburse_expense_request', 'create_financial_transfer', 'close_cash_account', 'record_owner_settlement_payment']
    LOOP
        SELECT count(*) INTO v_nb
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_nom;
        IF v_nb <> 1 THEN
            RAISE EXCEPTION 'Fonction % : % signatures, une seule attendue. Transaction annulee.', v_nom, v_nb;
        END IF;
    END LOOP;
END
$$;

COMMIT;

-- Certification : plus aucun appel uuid-ossp, et corps strictement identique au
-- texte genere depuis les migrations (signature insensible aux blancs).
WITH attendu(proname, lg_sig, sig_md5) AS (
    VALUES
        ('create_reservation', 1597::int, '4b49977bebc41c8261abf4e13be29d93'),
        ('create_sale', 3895::int, '2dd64a15da36f4f4a7981a28d3274667'),
        ('collect_sale_payment', 2025::int, '3cc36742d72cd999a52c24255e83ae90'),
        ('create_land_property', 1214::int, '57bb0c78e52171d336c26b6d459aaf9e'),
        ('create_expense_request', 1732::int, 'cf13f17f34e265dff179900efa3c5291'),
        ('disburse_expense_request', 2207::int, '3ab882ac41d8fc518395881b5f469337'),
        ('create_financial_transfer', 3137::int, '804e41b0aaa2d1e81c434cd22406045b'),
        ('close_cash_account', 2279::int, '66a1fd2a09c8896890eeb949d8cbebf2'),
        ('record_owner_settlement_payment', 3171::int, '496875a830b1e596d0ec596810cb2ea6')
),
actuel AS (
    SELECT p.proname,
           length(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) AS lg_sig,
           md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) AS sig_md5,
           (length(p.prosrc) - length(replace(p.prosrc, 'uuid_generate_v4', '')))
               / length('uuid_generate_v4') AS reste_uuid_ossp
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_reservation', 'create_sale', 'collect_sale_payment', 'create_land_property', 'create_expense_request', 'disburse_expense_request', 'create_financial_transfer', 'close_cash_account', 'record_owner_settlement_payment')
)
SELECT a.proname,
       a.reste_uuid_ossp,
       a.lg_sig AS lg_base,
       d.lg_sig AS lg_depot,
       (a.lg_sig = d.lg_sig AND a.sig_md5 = d.sig_md5 AND a.reste_uuid_ossp = 0) AS conforme
FROM actuel a
JOIN attendu d USING (proname)
ORDER BY a.proname;
