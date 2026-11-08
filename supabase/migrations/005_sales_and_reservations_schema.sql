-- BELL-MMS : Migration 005 - Schéma Réservations, Ventes, Échéanciers, Reçus & Suivi Propriétaires Tiers
-- Contexte : Devises XAF (FCFA), transactions sécurisées, anti-double vente

-- 1. TABLE DES RÉSERVATIONS
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'RES-2026-001'
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE RESTRICT,
    agreed_price NUMERIC(15, 2) NOT NULL,
    deposit_amount NUMERIC(15, 2) DEFAULT 0.00, -- Montant acompte versé
    reservation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    duration_days INTEGER NOT NULL DEFAULT 14,
    expiration_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'confirmee', 'expiree', 'annulee', 'transformee_en_vente'
    sales_rep_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    conditions TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_plot_id ON public.reservations(plot_id);

-- 2. TABLE DES VENTES
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'VTE-2026-001'
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE RESTRICT,
    reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
    sale_type VARCHAR(50) NOT NULL DEFAULT 'comptant', -- 'comptant' | 'echelonne'
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_price NUMERIC(15, 2) NOT NULL,
    discount_amount NUMERIC(15, 2) DEFAULT 0.00,
    final_price NUMERIC(15, 2) NOT NULL,
    initial_deposit NUMERIC(15, 2) DEFAULT 0.00,
    remaining_balance NUMERIC(15, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'virement', -- 'virement', 'cheque', 'versement_bancaire', 'especes'
    status VARCHAR(50) NOT NULL DEFAULT 'en_cours', -- 'en_cours', 'soldee', 'annulee'
    sales_rep_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    validated_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_active_sale_per_plot UNIQUE (plot_id) -- Contrôle strict anti-double vente au niveau schéma !
);

-- 3. TABLE DES ÉCHÉANCIERS DE PAIEMENT (Pour ventes échelonnées)
CREATE TABLE IF NOT EXISTS public.payment_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL, -- 1, 2, 3...
    due_date DATE NOT NULL,
    due_amount NUMERIC(15, 2) NOT NULL,
    paid_amount NUMERIC(15, 2) DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'en_attente', -- 'en_attente', 'partiel', 'paye', 'en_retard'
    paid_at TIMESTAMPTZ,
    receipt_reference VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLE DES REÇUS DE PAIEMENT (Immuables)
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'REC-2026-001'
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    schedule_id UUID REFERENCES public.payment_schedules(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) NOT NULL,
    transaction_ref VARCHAR(100), -- Numéro de chèque ou référence virement
    received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    pdf_path TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLE DES REVERSEMENTS AUX PROPRIÉTAIRES TIERS
CREATE TABLE IF NOT EXISTS public.third_party_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'REV-2026-001'
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    total_sale_price NUMERIC(15, 2) NOT NULL,
    owner_base_amount NUMERIC(15, 2) NOT NULL, -- Montant de référence dû au propriétaire
    company_commission NUMERIC(15, 2) NOT NULL, -- Commission ou marge brute BELL
    amount_paid_to_owner NUMERIC(15, 2) DEFAULT 0.00,
    balance_due_to_owner NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'en_attente', -- 'en_attente', 'partiellement_paye', 'solde'
    settlement_date DATE,
    payment_proof_ref VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. POLITIQUES RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.third_party_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture des ventes autorisée"
ON public.sales FOR SELECT TO authenticated
USING (public.has_permission('sales:read'));

CREATE POLICY "Création de vente autorisée"
ON public.sales FOR INSERT TO authenticated
WITH CHECK (public.has_permission('sales:create'));

CREATE POLICY "Validation de vente par direction"
ON public.sales FOR UPDATE TO authenticated
USING (public.has_permission('sales:validate') OR public.has_permission('sales:create'));

CREATE POLICY "Lecture des réservations"
ON public.reservations FOR SELECT TO authenticated
USING (public.has_permission('sales:read'));

CREATE POLICY "Gestion des réservations"
ON public.reservations FOR ALL TO authenticated
USING (public.has_permission('sales:create'));

CREATE POLICY "Lecture des reçus de paiement"
ON public.receipts FOR SELECT TO authenticated
USING (public.has_permission('sales:read'));

CREATE POLICY "Lecture des reversements propriétaires"
ON public.third_party_settlements FOR SELECT TO authenticated
USING (public.has_permission('finance:read') OR public.get_auth_role() = 'directeur_general');

-- 7. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_reservations ON public.reservations;
CREATE TRIGGER trg_audit_reservations AFTER INSERT OR UPDATE OR DELETE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_sales ON public.sales;
CREATE TRIGGER trg_audit_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_receipts ON public.receipts;
CREATE TRIGGER trg_audit_receipts AFTER INSERT OR UPDATE ON public.receipts
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
