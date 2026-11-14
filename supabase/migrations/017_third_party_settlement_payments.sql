-- BELL-MMS : Migration 017 - Reversements aux propriétaires tiers
-- RPC atomique : mise à jour du reversement + débit de trésorerie + écriture comptable.
-- La table third_party_settlements n'avait aucune policy d'écriture : tout passait ou échouait côté client.

-- 1. TRACE D'AUDIT DES REVERSEMENTS (aucun trigger n'existait)
DROP TRIGGER IF EXISTS trg_audit_third_party_settlements ON public.third_party_settlements;
CREATE TRIGGER trg_audit_third_party_settlements
AFTER INSERT OR UPDATE OR DELETE ON public.third_party_settlements
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- 2. INDEX DE LECTURE
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.third_party_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_partner ON public.third_party_settlements(partner_id);

-- 3. ENREGISTREMENT D'UN REVERSEMENT PROPRIÉTAIRE
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
            || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', ''), 1, 6)),
        v_account.id, 'depense', 'dep_reversement_proprietaire', p_amount, CURRENT_DATE,
        COALESCE(v_partner_name, 'Propriétaire tiers'),
        'Reversement propriétaire : ' || v_settlement.reference || ' (' || BTRIM(p_proof_ref) || ')',
        'settlement', v_settlement.id::TEXT,
        v_new_account_balance, auth.uid(), COALESCE(public.current_profile_name(), 'Direction')
    );

    RETURN v_settlement;
END;
$$;

-- 4. DROITS D'EXÉCUTION
REVOKE ALL ON FUNCTION public.record_owner_settlement_payment(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_owner_settlement_payment(UUID, UUID, NUMERIC, TEXT) TO authenticated;
