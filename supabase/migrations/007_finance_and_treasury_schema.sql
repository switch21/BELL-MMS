-- BELL-MMS : Migration 007 - Schéma Finances, Caisses, Banques, Dépenses avec Seuils, Transferts & Clôtures
-- Contexte : Devises XAF (FCFA), transactions atomiques, interdiction d'auto-validation

-- 1. TABLE DES COMPTES BANCAIRES ET CAISSES
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- ex: 'CAISSE-AKWA', 'BNK-UBA-01'
    name VARCHAR(150) NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- 'caisse' | 'banque'
    bank_name VARCHAR(100), -- si compte bancaire (UBA, BICEC, etc.)
    account_number VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'XAF',
    initial_balance NUMERIC(15, 2) DEFAULT 0.00,
    current_balance NUMERIC(15, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertion des caisses et comptes initiaux
INSERT INTO public.financial_accounts (code, name, account_type, bank_name, account_number, initial_balance, current_balance) VALUES
('CAISSE-PRINCIPALE', 'Caisse Centrale Akwa', 'caisse', NULL, NULL, 5000000.00, 4800000.00),
('CAISSE-PK21', 'Caisse Secondaire Chantier PK21', 'caisse', NULL, NULL, 1000000.00, 650000.00),
('BNK-UBA-DLA', 'Compte Courant UBA Cameroun', 'banque', 'UBA Cameroun', '10033-05200-12345678901-44', 25000000.00, 24500000.00),
('BNK-BICEC-DLA', 'Compte Opérations BICEC Bonanjo', 'banque', 'BICEC', '10001-06800-98765432109-12', 15000000.00, 12850000.00)
ON CONFLICT (code) DO NOTHING;

-- 2. TABLE DES CATÉGORIES DE RECETTES ET DÉPENSES
CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_type VARCHAR(20) NOT NULL, -- 'recette' | 'depense'
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

INSERT INTO public.financial_categories (category_type, code, name, description) VALUES
('recette', 'rec_vente_terrain', 'Vente de terrains propres', 'Encaissements des ventes foncières BELL'),
('recette', 'rec_commission_tiers', 'Commissions & Marges mandats tiers', 'Part d''intermédiation sur terrains partenaires'),
('recette', 'rec_honoraires_prestation', 'Honoraires prestations & mutations', 'Assistance foncière et démarches'),
('recette', 'rec_commission_financement', 'Commissions montage de crédit', 'Honoraires recherche de financement'),
('depense', 'dep_travaux_viabilisation', 'Travaux de viabilisation & Chantiers', 'Terrassement, piquetage, voirie'),
('depense', 'dep_droits_enregistrement', 'Frais administratifs, Cadastre & Notaire', 'Frais de timbres, enregistrement'),
('depense', 'dep_commissions_apporteurs', 'Commissions apporteurs d''affaires', 'Rémunération des apporteurs'),
('depense', 'dep_frais_generaux', 'Frais généraux & Fonctionnement', 'Loyers, fournitures, télécoms, carburant'),
('depense', 'dep_reversement_proprietaire', 'Reversements aux propriétaires de terrains', 'Paiement des parts sous mandat')
ON CONFLICT (code) DO NOTHING;

-- 3. TABLE DES DÉPENSES & CIRCUITS DE VALIDATION
CREATE TABLE IF NOT EXISTS public.expense_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'DEP-2026-001'
    category_code VARCHAR(50) NOT NULL,
    account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    beneficiary VARCHAR(150) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    requires_dg_approval BOOLEAN DEFAULT false,
    status VARCHAR(50) NOT NULL DEFAULT 'en_attente', -- 'en_attente', 'approuve', 'rejete', 'decaisse'
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    approval_notes TEXT,
    disbursed_at TIMESTAMPTZ,
    payment_proof_ref VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Contrainte stricte : Le demandeur ne peut pas être l'approbateur !
    CONSTRAINT chk_no_self_approval CHECK (requested_by != approved_by)
);

-- 4. TABLE DES MOUVEMENTS FINANCIERS (Transactions de trésorerie globales)
CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'TRX-2026-001'
    account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(20) NOT NULL, -- 'recette' | 'depense' | 'transfert_debit' | 'transfert_credit'
    category_code VARCHAR(50),
    amount NUMERIC(15, 2) NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    beneficiary_or_payer VARCHAR(150),
    description TEXT NOT NULL,
    related_entity_type VARCHAR(50), -- 'sale', 'receipt', 'expense', 'settlement', 'transfer'
    related_entity_id VARCHAR(100),
    balance_after NUMERIC(15, 2) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLE DES TRANSFERTS INTER-COMPTES (Atomiques)
CREATE TABLE IF NOT EXISTS public.financial_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'TRF-2026-001'
    from_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    to_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    amount NUMERIC(15, 2) NOT NULL,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT NOT NULL,
    initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_different_accounts CHECK (from_account_id != to_account_id)
);

-- 6. TABLE DES CLÔTURES DE CAISSE (Inaltérables)
CREATE TABLE IF NOT EXISTS public.cash_closures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'CLO-2026-11-08'
    account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    closure_date DATE NOT NULL DEFAULT CURRENT_DATE,
    opening_balance NUMERIC(15, 2) NOT NULL,
    total_inflow NUMERIC(15, 2) NOT NULL,
    total_outflow NUMERIC(15, 2) NOT NULL,
    theoretical_balance NUMERIC(15, 2) NOT NULL, -- Solde théorique calculé
    physical_count_balance NUMERIC(15, 2) NOT NULL, -- Comptage physique réel des billets et pièces
    discrepancy NUMERIC(15, 2) GENERATED ALWAYS AS (physical_count_balance - theoretical_balance) STORED,
    discrepancy_explanation TEXT,
    closed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'validee', -- 'validee' (inaltérable)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. POLITIQUES RLS
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture finances par utilisateurs autorisés"
ON public.financial_accounts FOR SELECT TO authenticated
USING (public.has_permission('finance:read'));

CREATE POLICY "Lecture catégories"
ON public.financial_categories FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Lecture des dépenses"
ON public.expense_requests FOR SELECT TO authenticated
USING (public.has_permission('finance:read') OR requested_by = auth.uid());

CREATE POLICY "Demande de dépense autorisée"
ON public.expense_requests FOR INSERT TO authenticated
WITH CHECK (public.has_permission('finance:expense:request'));

CREATE POLICY "Approbation de dépense par responsables habilités"
ON public.expense_requests FOR UPDATE TO authenticated
USING (public.has_permission('finance:expense:approve') OR public.get_auth_role() IN ('directeur_general', 'super_admin'));

CREATE POLICY "Lecture transactions de trésorerie"
ON public.financial_transactions FOR SELECT TO authenticated
USING (public.has_permission('finance:read'));

CREATE POLICY "Lecture clôtures de caisse"
ON public.cash_closures FOR SELECT TO authenticated
USING (public.has_permission('finance:read'));

-- 8. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_expenses ON public.expense_requests;
CREATE TRIGGER trg_audit_expenses AFTER INSERT OR UPDATE OR DELETE ON public.expense_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_transfers ON public.financial_transfers;
CREATE TRIGGER trg_audit_transfers AFTER INSERT ON public.financial_transfers
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_closures ON public.cash_closures;
CREATE TRIGGER trg_audit_closures AFTER INSERT ON public.cash_closures
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
