-- BELL-MMS : Migration 016 - Flux financiers raccordés (dépenses, arbitrages, décaissements, transferts, clôtures)
-- Contexte : XAF, écritures atomiques, ségrégation des tâches, noms dénormalisés (RLS profiles)

-- 1. COLONNES DÉNORMALISÉES
-- Les profils des autres utilisateurs ne sont pas lisibles (RLS), donc les noms sont figés au moment de l'opération.
ALTER TABLE public.expense_requests
    ADD COLUMN IF NOT EXISTS requested_by_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS approved_by_name VARCHAR(200);

ALTER TABLE public.financial_transactions
    ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(200);

ALTER TABLE public.financial_transfers
    ADD COLUMN IF NOT EXISTS from_account_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS to_account_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS initiated_by_name VARCHAR(200);

ALTER TABLE public.cash_closures
    ADD COLUMN IF NOT EXISTS account_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS closed_by_name VARCHAR(200);

-- Suivi des marges sur terrains de tiers utilisé par la synthèse financière
ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS is_third_party_plot BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS bell_margin_amount NUMERIC(15, 2) NOT NULL DEFAULT 0;

-- 2. LECTURE DES TRANSFERTS (la table n'avait aucune politique : tout était refusé)
DROP POLICY IF EXISTS "Lecture des transferts de fonds" ON public.financial_transfers;
CREATE POLICY "Lecture des transferts de fonds"
ON public.financial_transfers FOR SELECT TO authenticated
USING (public.has_permission('finance:read'));

-- 3. INDEX DE LECTURE
CREATE INDEX IF NOT EXISTS idx_expense_requests_status ON public.expense_requests(status);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_account ON public.financial_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON public.financial_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_closures_account ON public.cash_closures(account_id);

-- 4. TRIGGERS D'AUDIT (les mouvements de trésorerie et soldes n'étaient pas tracés)
DROP TRIGGER IF EXISTS trg_audit_transactions ON public.financial_transactions;
CREATE TRIGGER trg_audit_transactions AFTER INSERT ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_financial_accounts ON public.financial_accounts;
CREATE TRIGGER trg_audit_financial_accounts AFTER INSERT OR UPDATE ON public.financial_accounts
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- 5. NOM DE L'UTILISATEUR CONNECTÉ (lisible même sans accès aux autres profils)
CREATE OR REPLACE FUNCTION public.current_profile_name()
RETURNS VARCHAR
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT NULLIF(BTRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')
    FROM public.profiles p
    WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_profile_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_name() TO authenticated;

-- 6. DEMANDE DE DÉPENSE
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
            || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 6)),
        p_category_code, p_account_id, BTRIM(p_beneficiary), p_amount, v_date,
        BTRIM(p_description), auth.uid(), COALESCE(public.current_profile_name(), 'Demandeur'),
        p_amount > v_threshold, 'en_attente'
    )
    RETURNING * INTO v_expense;

    RETURN v_expense;
END;
$$;

-- 7. ARBITRAGE (APPROBATION / REJET) - AUTO-VALIDATION INTERDITE
CREATE OR REPLACE FUNCTION public.decide_expense_request(
    p_expense_id UUID,
    p_decision VARCHAR,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.expense_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expense public.expense_requests%ROWTYPE;
BEGIN
    IF NOT (
        public.has_permission('finance:expense:approve')
        OR public.get_auth_role() IN ('directeur_general', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Permission refusée pour arbitrer une dépense.' USING ERRCODE = '42501';
    END IF;

    IF p_decision NOT IN ('approuve', 'rejete') THEN
        RAISE EXCEPTION 'Décision invalide : approuver ou rejeter uniquement.';
    END IF;

    SELECT * INTO v_expense
    FROM public.expense_requests
    WHERE id = p_expense_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Demande de dépense introuvable.';
    END IF;

    IF v_expense.status <> 'en_attente' THEN
        RAISE EXCEPTION 'Cette demande a déjà été arbitrée (statut %).', v_expense.status;
    END IF;

    IF v_expense.requested_by = auth.uid() THEN
        RAISE EXCEPTION 'Auto-validation interdite : le demandeur ne peut pas approuver sa propre dépense.'
            USING ERRCODE = '42501';
    END IF;

    IF v_expense.requires_dg_approval
       AND public.get_auth_role() NOT IN ('directeur_general', 'super_admin') THEN
        RAISE EXCEPTION 'Cette dépense dépasse le seuil : seul le Directeur Général peut l''arbitrer.'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.expense_requests
    SET status = p_decision,
        approved_by = auth.uid(),
        approved_by_name = COALESCE(public.current_profile_name(), 'Approbateur'),
        approved_at = NOW(),
        approval_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_expense_id
    RETURNING * INTO v_expense;

    RETURN v_expense;
END;
$$;

-- 8. DÉCAISSEMENT EFFECTIF D'UNE DÉPENSE APPROUVÉE
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
            || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 6)),
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

-- 9. TRANSFERT INTER-COMPTES ATOMIQUE
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
        || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 6));

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

-- 10. CLÔTURE JOURNALIÈRE DE CAISSE (PROCÈS-VERBAL INALTÉRABLE)
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
            || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 4)),
        v_account.id, CURRENT_DATE, v_theoretical - v_inflow + v_outflow, v_inflow, v_outflow,
        v_theoretical, p_physical_count,
        COALESCE(NULLIF(BTRIM(COALESCE(p_explanation, '')), ''), 'Comptage physique conforme au solde théorique.'),
        auth.uid(), 'validee', v_account.name, COALESCE(public.current_profile_name(), 'Responsable Caisse')
    )
    RETURNING * INTO v_closure;

    RETURN v_closure;
END;
$$;

-- 11. DROITS D'EXÉCUTION
REVOKE ALL ON FUNCTION public.create_expense_request(VARCHAR, UUID, VARCHAR, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_expense_request(UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disburse_expense_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_financial_transfer(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_cash_account(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_expense_request(VARCHAR, UUID, VARCHAR, NUMERIC, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_expense_request(UUID, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disburse_expense_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_financial_transfer(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_account(UUID, NUMERIC, TEXT) TO authenticated;
