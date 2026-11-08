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
        'RES-' || EXTRACT(YEAR FROM v_today)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8)),
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
        'VTE-' || EXTRACT(YEAR FROM v_sale_date)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8)),
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
            'REC-' || EXTRACT(YEAR FROM v_sale_date)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8)),
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
        'REC-' || EXTRACT(YEAR FROM v_today)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 8)),
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

REVOKE ALL ON FUNCTION public.create_reservation(UUID, UUID, NUMERIC, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_sale(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, INTEGER, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.collect_sale_payment(UUID, NUMERIC, VARCHAR, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_reservation(UUID, UUID, NUMERIC, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, INTEGER, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_sale_payment(UUID, NUMERIC, VARCHAR, TEXT, TEXT) TO authenticated;
