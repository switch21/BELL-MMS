-- BELL-MMS : Migration 026 - Marches Publics & Appels d'Offres
-- Le menu /tenders etait un placeholder sans table : ce lot cree le domaine, sa RLS et son audit.
-- Aucun droit nouveau : tenders:manage existe deja et n'est accorde qu'a directeur_general et
-- super_admin. Les paiements des marches restent dans financial_transactions : ce module suit les
-- pieces et les ordres de service, il ne tient pas la tresorerie.

-- 1. TABLE DES APPELS D'OFFRES ET MARCHES
CREATE TABLE IF NOT EXISTS public.tenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'AOO-2026-A1B2C3D4'
    title VARCHAR(200) NOT NULL,
    contracting_authority VARCHAR(200), -- maitre d'ouvrage
    source VARCHAR(120), -- journal, plateforme, COLEPS, MINMAP...
    tender_method VARCHAR(40) NOT NULL DEFAULT 'appel_offres',
    status VARCHAR(30) NOT NULL DEFAULT 'veille',
    estimated_amount NUMERIC(15, 2),
    caution_amount NUMERIC(15, 2),
    bid_amount NUMERIC(15, 2),
    contract_number VARCHAR(80),
    awarded_at DATE,
    contract_signed_at DATE,
    advance_payment_rate NUMERIC(5, 2),
    publication_date DATE,
    deadline DATE,
    execution_delay_days INTEGER,
    site_location VARCHAR(200),
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to_name VARCHAR(200),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_tender_method CHECK (
        tender_method IN ('appel_offres', 'consultation', 'sous_entente', 'gre_a_gre')
    ),
    CONSTRAINT chk_tender_status CHECK (
        status IN ('veille', 'candidature', 'soumission', 'adjudique', 'sans_suite', 'abandonne', 'en_execution', 'cloture')
    ),
    CONSTRAINT chk_tender_deadline CHECK (
        deadline IS NULL OR publication_date IS NULL OR deadline >= publication_date
    ),
    CONSTRAINT chk_tender_advance CHECK (
        advance_payment_rate IS NULL OR (advance_payment_rate >= 0 AND advance_payment_rate <= 100)
    ),
    CONSTRAINT chk_tender_execution_delay CHECK (
        execution_delay_days IS NULL OR execution_delay_days > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_tenders_status ON public.tenders(status);
CREATE INDEX IF NOT EXISTS idx_tenders_deadline ON public.tenders(deadline);
CREATE INDEX IF NOT EXISTS idx_tenders_assigned ON public.tenders(assigned_to);

-- 2. TABLE DES PIECES DU DOSSIER
CREATE TABLE IF NOT EXISTS public.tender_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'administratif',
    status VARCHAR(20) NOT NULL DEFAULT 'a_obtenir',
    obtained_at DATE,
    valid_until DATE,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_tender_doc_category CHECK (category IN ('administratif', 'technique', 'financier')),
    CONSTRAINT chk_tender_doc_status CHECK (
        status IN ('a_obtenir', 'en_cours', 'obtenu', 'valide', 'rejete')
    ),
    CONSTRAINT uq_tender_document UNIQUE (tender_id, title)
);

CREATE INDEX IF NOT EXISTS idx_tender_documents_tender ON public.tender_documents(tender_id);

-- 3. TABLE DES ORDRES DE SERVICE, AVENANTS ET DECOMPTES
CREATE TABLE IF NOT EXISTS public.tender_service_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
    reference VARCHAR(50) NOT NULL, -- ex: 'OS-2026-003', 'DEC-2026-001'
    order_type VARCHAR(20) NOT NULL DEFAULT 'ordre_service',
    title VARCHAR(200) NOT NULL,
    issued_on DATE,
    amount NUMERIC(15, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'emis',
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_tender_so_type CHECK (order_type IN ('ordre_service', 'avenant', 'decompte')),
    CONSTRAINT chk_tender_so_status CHECK (status IN ('emis', 'notifie', 'facture', 'paye', 'refuse')),
    CONSTRAINT uq_tender_service_order UNIQUE (tender_id, reference)
);

CREATE INDEX IF NOT EXISTS idx_tender_service_orders_tender ON public.tender_service_orders(tender_id);

-- 4. POLITIQUES RLS
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_service_orders ENABLE ROW LEVEL SECURITY;

-- Le marche public est un objet de suivi commun : tout utilisateur authentifie le lit.
DROP POLICY IF EXISTS tenders_lecture ON public.tenders;
CREATE POLICY tenders_lecture
ON public.tenders FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tenders_creation ON public.tenders;
CREATE POLICY tenders_creation
ON public.tenders FOR INSERT TO authenticated
WITH CHECK (public.has_permission('tenders:manage'));

-- Le porteur du droit corrige n'importe quel marche ; le charge de marche corrige le sien.
DROP POLICY IF EXISTS tenders_modification ON public.tenders;
CREATE POLICY tenders_modification
ON public.tenders FOR UPDATE TO authenticated
USING (
    public.has_permission('tenders:manage')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
)
WITH CHECK (
    public.has_permission('tenders:manage')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
);

DROP POLICY IF EXISTS tenders_suppression_direction ON public.tenders;
CREATE POLICY tenders_suppression_direction
ON public.tenders FOR DELETE TO authenticated
USING (public.get_auth_role() IN ('directeur_general', 'super_admin'));

DROP POLICY IF EXISTS tender_documents_lecture ON public.tender_documents;
CREATE POLICY tender_documents_lecture
ON public.tender_documents FOR SELECT TO authenticated
USING (true);

-- Pieces et ordres de service se jugent par le marche parent : sinon le charge d'un marche
-- ne peut ni monter son dossier ni enregistrer ses ordres de service.
DROP POLICY IF EXISTS tender_documents_creation ON public.tender_documents;
CREATE POLICY tender_documents_creation
ON public.tender_documents FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS tender_documents_modification ON public.tender_documents;
CREATE POLICY tender_documents_modification
ON public.tender_documents FOR UPDATE TO authenticated
USING (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
)
WITH CHECK (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS tender_documents_suppression ON public.tender_documents;
CREATE POLICY tender_documents_suppression
ON public.tender_documents FOR DELETE TO authenticated
USING (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS tender_service_orders_lecture ON public.tender_service_orders;
CREATE POLICY tender_service_orders_lecture
ON public.tender_service_orders FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tender_service_orders_creation ON public.tender_service_orders;
CREATE POLICY tender_service_orders_creation
ON public.tender_service_orders FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS tender_service_orders_modification ON public.tender_service_orders;
CREATE POLICY tender_service_orders_modification
ON public.tender_service_orders FOR UPDATE TO authenticated
USING (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
)
WITH CHECK (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS tender_service_orders_suppression ON public.tender_service_orders;
CREATE POLICY tender_service_orders_suppression
ON public.tender_service_orders FOR DELETE TO authenticated
USING (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

-- 5. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_tenders ON public.tenders;
CREATE TRIGGER trg_audit_tenders AFTER INSERT OR UPDATE OR DELETE ON public.tenders
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_tender_documents ON public.tender_documents;
CREATE TRIGGER trg_audit_tender_documents AFTER INSERT OR UPDATE OR DELETE ON public.tender_documents
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_tender_service_orders ON public.tender_service_orders;
CREATE TRIGGER trg_audit_tender_service_orders AFTER INSERT OR UPDATE OR DELETE ON public.tender_service_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
