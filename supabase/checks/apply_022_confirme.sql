-- Meme contenu que supabase/migrations/022_impute_reservation_deposit.sql, avec le garde-fou
-- de confirmation pour un collage dans l'editeur SQL du tableau de bord. Ne jamais coller les deux :
-- celui-ci est la voie unique. Les ecrites ne partent que si bell.confirme_022 vaut 'oui'.
-- Le premier bloc DO refuse toute ecriture ; sans passage a 'oui' le script ne touche rien et rend une erreur.

SELECT set_config('bell.confirme_022', 'non', false);

DO $$
BEGIN
    IF coalesce(current_setting('bell.confirme_022', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_022 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$$;

-- 022 : imputation de l'acompte de reservation sur le prix de la vente
-- Defaut constate le 2026-11-15 en jouant la conversion reservation -> vente : create_sale
-- calculait v_balance = v_price - p_initial_deposit sans jamais regarder reservations.deposit_amount.
-- L'acompte deja encaisse a la reservation n'etait donc ni credite sur le prix, ni trace comme recu :
-- une conversion au comptant encaissait le prix ENTIER par-dessus l'acompte (13 800 000 F verses pour
-- une parcelle a 12 800 000 F sur TEST-LOT-02).
--
-- Regles instaurees ici (arbitrages A/B/C/D du 2026-11-15) :
--   A - l'imputation est automatique des qu'une reservation valide est fournie (pas de parametre),
--   B - l'acompte impute est journalise en tant que recu (payment_date = date de la reservation,
--       transaction_ref = reference de la reservation) pour que final_price - SOMME(recus) =
--       remaining_balance reste vrai,
--   C - sales.initial_deposit devient le total impute a la signature (apport saisi + acompte),
--   D - la vente au comptant exige apport + acompte = prix (et non plus apport = prix).
-- Signature, SECURITY DEFINER et search_path evalues exactement comme dans 020 : rien d'autre ne change.

BEGIN;

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
    v_credit NUMERIC(15, 2) := 0;
    v_covered NUMERIC(15, 2);
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

    -- A : l'acompte deja encaisse a la reservation est impute, sans option possible.
    IF p_reservation_id IS NOT NULL THEN
        v_credit := COALESCE(v_reservation.deposit_amount, 0);
    END IF;

    v_covered := p_initial_deposit + v_credit;

    IF v_covered > v_price THEN
        RAISE EXCEPTION 'Le règlement (apport plus acompte de réservation) dépasse le prix de la parcelle.';
    END IF;
    IF p_sale_type = 'comptant' AND v_covered <> v_price THEN
        RAISE EXCEPTION 'Une vente au comptant doit être réglée intégralement, acompte de réservation inclus.';
    END IF;

    v_balance := v_price - v_covered;
    v_status := CASE WHEN v_balance = 0 THEN 'soldee' ELSE 'en_cours' END;

    INSERT INTO public.sales (
        reference, client_id, plot_id, reservation_id, sale_type, sale_date,
        total_price, discount_amount, final_price, initial_deposit,
        remaining_balance, payment_method, status, sales_rep_id, notes
    )
    VALUES (
        'VTE-' || EXTRACT(YEAR FROM v_sale_date)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
        p_client_id, p_plot_id, p_reservation_id, p_sale_type, v_sale_date,
        v_price, 0, v_price, v_covered, v_balance, p_payment_method,
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

    -- B : l'acompte impute devient un recu rattache a la vente, date du jour de la reservation.
    IF v_credit > 0 THEN
        INSERT INTO public.receipts (
            reference, sale_id, amount, payment_date, payment_method, transaction_ref,
            received_by, notes
        )
        VALUES (
            'REC-' || EXTRACT(YEAR FROM v_reservation.reservation_date)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
            v_sale.id, v_credit, v_reservation.reservation_date, p_payment_method,
            v_reservation.reference, auth.uid(),
            'Acompte de réservation ' || v_reservation.reference || ' imputé sur la vente'
        );
    END IF;

    IF p_initial_deposit > 0 THEN
        INSERT INTO public.receipts (
            reference, sale_id, amount, payment_date, payment_method, received_by, notes
        )
        VALUES (
            'REC-' || EXTRACT(YEAR FROM v_sale_date)::TEXT || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
            v_sale.id, p_initial_deposit, v_sale_date, p_payment_method, auth.uid(),
            CASE
                WHEN v_credit > 0 AND p_sale_type = 'comptant' THEN 'Complément du comptant, acompte de réservation imputé par ailleurs'
                WHEN p_sale_type = 'comptant' THEN 'Règlement total au comptant'
                ELSE 'Acompte initial de vente échelonnée'
            END
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

-- Garde-fou : create_sale ne doit pas devenir une surcharge. CREATE OR REPLACE cree un doublon
-- si la signature a derive ; on le detecte avant COMMIT, donc tout est annule.
DO $$
DECLARE
    v_nb INT;
BEGIN
    SELECT count(*) INTO v_nb
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_sale';
    IF v_nb <> 1 THEN
        RAISE EXCEPTION 'create_sale : % signatures, une seule attendue. Transaction annulee.', v_nb;
    END IF;
END
$$;

COMMIT;

-- Certification (LECTURE SEULE, un seul jeu de resultats, 1 ligne attendue) :
--   conforme = le corps en base a la meme signature insensible aux blancs que le texte du depot 022
--   definer / epingle = la recree n'a pas perdu SECURITY DEFINER ni le search_path epingle
--   8 args / retour sales = la signature publique est inchangee pour le client
-- Attendu : conforme = true, definer = true, epingle = true, nb_args = 8, uuid_retour = true,
--           appelle_imputation = true, recu_impute = true.
WITH attendu(proname, lg_depot, md5_depot) AS (
    VALUES ('create_sale', 4925::int, 'ff7d6f60ab8319ba01738495cb19df7b')
),
actuel AS (
    SELECT p.proname,
           length(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) AS lg_sig,
           md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')))    AS sig_md5,
           COALESCE(array_to_string(p.proconfig, ' ; '), '')         AS cfg,
           p.prosecdef,
           p.proargn,
           pg_catalog.format_type(p.prorettype, NULL)                AS retour,
           (p.prosrc LIKE '%v_covered := p_initial_deposit + v_credit%') AS appelle_imputation,
           (p.prosrc LIKE '%imputé sur la vente%')                  AS recu_impute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_sale'
)
SELECT a.proname,
       a.lg_sig AS lg_base,
       d.lg_depot,
       (a.lg_sig = d.lg_depot AND a.sig_md5 = d.md5_depot)              AS conforme,
       a.prosecdef                                                      AS definer,
       (a.cfg = 'search_path=public, pg_temp')                          AS epingle,
       a.proargn                                                        AS nb_args,
       (a.retour = 'uuid')                                              AS uuid_retour,
       a.appelle_imputation,
       a.recu_impute
FROM actuel a
JOIN attendu d USING (proname);
