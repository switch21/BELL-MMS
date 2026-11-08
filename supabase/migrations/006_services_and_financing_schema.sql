-- BELL-MMS : Migration 006 - Schéma Prestations Administratives, Mutations, Jugements d'Hérédité & Recherche de Financement
-- Contexte : Cameroun (MINDCAF, Cadastre, Notaires, Banques locales)

-- 1. TABLE DES TYPES DE PRESTATIONS
CREATE TABLE IF NOT EXISTS public.service_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- ex: 'mutation_fonciere', 'jugement_heredite', 'bornage'
    name VARCHAR(150) NOT NULL,
    description TEXT,
    standard_fee NUMERIC(15, 2) DEFAULT 0.00,
    estimated_duration_days INTEGER DEFAULT 30,
    required_documents JSONB, -- Liste des pièces requises
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.service_types (code, name, description, standard_fee, estimated_duration_days, required_documents) VALUES
('mutation_totale', 'Mutation Foncière Totale', 'Transfert intégral de propriété d''un titre foncier existant', 750000.00, 60, '["Titre Foncier original", "Acte de vente notarié", "CNI des parties", "Quittance de paiement droits d''enregistrement"]'),
('mutation_partielle', 'Mutation Foncière Partielle (Morcellement)', 'Création d''un nouveau titre foncier issu d''un lotissement ou morcellement', 950000.00, 90, '["Plan de bornage visé par le Cadastre", "Certificat de propriété", "Procès-verbal de bornage contradictoire", "Acte de vente notarié"]'),
('jugement_heredite', 'Jugement d''Hérédité & Déclaration de Succession', 'Régularisation successorale auprès du Tribunal de Première Instance', 500000.00, 45, '["Acte de décès du de cujus", "Actes de naissance des ayants-droit", "Certificat de mariage", "Certificat de non-appel"]'),
('dossier_technique_cadastre', 'Constitution Dossier Technique Cadastral', 'Levé topographique et immatriculation au Cadastre', 400000.00, 30, '["Croquis de situation", "Accords des riverains", "PV de piquetage géomètre"]')
ON CONFLICT (code) DO NOTHING;

-- 2. TABLE DES DOSSIERS DE PRESTATIONS
CREATE TABLE IF NOT EXISTS public.service_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'MUT-2026-001'
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    service_type_id UUID NOT NULL REFERENCES public.service_types(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Collaborateur responsable
    opened_date DATE NOT NULL DEFAULT CURRENT_DATE,
    target_date DATE,
    closing_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'creation',
    -- 'creation', 'pieces_en_cours', 'instruction_cadastre', 'soumis_validation_dg', 'approuve_dg', 'rejete_dg', 'cloture'
    fee_agreed NUMERIC(15, 2) NOT NULL, -- Honoraires convenus
    expenses_estimated NUMERIC(15, 2) DEFAULT 0.00, -- Frais prévisionnels
    expenses_actual NUMERIC(15, 2) DEFAULT 0.00, -- Frais réels décaissés
    amount_paid NUMERIC(15, 2) DEFAULT 0.00, -- Montant encaissé auprès du client
    dg_validation_status VARCHAR(50) DEFAULT 'non_soumis', -- 'non_soumis', 'en_attente', 'approuve', 'rejete'
    dg_validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    dg_validation_date TIMESTAMPTZ,
    dg_notes TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLE DES ÉTAPES D'UN DOSSIER (Workflow traçable)
CREATE TABLE IF NOT EXISTS public.service_case_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'en_attente', -- 'en_attente', 'en_cours', 'termine', 'bloque'
    completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLE DES DOSSIERS DE RECHERCHE DE FINANCEMENT
CREATE TABLE IF NOT EXISTS public.financing_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'FIN-2026-001'
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    partner_bank_id UUID REFERENCES public.partners(id) ON DELETE SET NULL, -- Banque partenaire
    purpose VARCHAR(200) NOT NULL, -- Objet du crédit (Acquisition foncière, construction)
    amount_requested NUMERIC(15, 2) NOT NULL,
    amount_approved NUMERIC(15, 2) DEFAULT 0.00,
    duration_months INTEGER NOT NULL DEFAULT 60,
    proposed_collateral TEXT, -- Garanties (Titre foncier, caution)
    status VARCHAR(50) NOT NULL DEFAULT 'etude',
    -- 'prospect', 'etude', 'en_constitution', 'soumis_banque', 'en_attente', 'complement_demande', 'accepte', 'refuse', 'financement_obtenu', 'cloture'
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    commission_rate NUMERIC(5, 2) DEFAULT 3.00, -- Honoraires de montage (%)
    commission_amount NUMERIC(15, 2) DEFAULT 0.00,
    decision_date DATE,
    decision_notes TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. POLITIQUES RLS
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_case_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture des types de prestations"
ON public.service_types FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Lecture des dossiers de prestations"
ON public.service_cases FOR SELECT TO authenticated
USING (public.has_permission('services:read'));

CREATE POLICY "Création et mise à jour des dossiers"
ON public.service_cases FOR ALL TO authenticated
USING (public.has_permission('services:write'));

CREATE POLICY "Validation des dossiers par Direction"
ON public.service_cases FOR UPDATE TO authenticated
USING (public.has_permission('services:validate') OR public.get_auth_role() IN ('directeur_general', 'super_admin'));

CREATE POLICY "Lecture des dossiers de financement"
ON public.financing_cases FOR SELECT TO authenticated
USING (public.has_permission('services:read'));

CREATE POLICY "Gestion du financement"
ON public.financing_cases FOR ALL TO authenticated
USING (public.has_permission('services:write') OR public.has_permission('services:read'));

-- 6. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_service_cases ON public.service_cases;
CREATE TRIGGER trg_audit_service_cases AFTER INSERT OR UPDATE OR DELETE ON public.service_cases
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_financing_cases ON public.financing_cases;
CREATE TRIGGER trg_audit_financing_cases AFTER INSERT OR UPDATE OR DELETE ON public.financing_cases
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
