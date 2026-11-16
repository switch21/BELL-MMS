-- Meme contenu que supabase/migrations/026_tenders_schema.sql, avec le garde-fou de confirmation
-- et un controle de coherence avant COMMIT, pour un collage dans l'editeur SQL du tableau de bord.
-- Ne jamais coller les deux : celui-ci est la voie unique.
--
-- Les ecrites ne partent que si bell.confirme_026 vaut 'oui'. Sans ce passage, le script ne touche
-- rien et rend une erreur.
--
-- Objet : raccorder le menu /tenders (Marches Publics & Appels d'Offres), jusqu'ici placeholder
-- sans aucune table. Cree tenders, tender_documents, tender_service_orders, leur RLS et leur audit.
-- Aucun droit nouveau : tenders:manage existe deja et ne change pas de proprietaire
-- (directeur_general et super_admin). Les paiements restent dans financial_transactions.
-- Attendu apres application : 3 tables, 12 policies, 3 triggers d'audit, 9 contraintes de domaine,
-- 5 index, 2 cles uniques nommees, 2 cascades, total_matrice inchange.

-- 1. PRE-VOL LECTURE SEULE (ne transforme rien) : etat avant collage.
-- Attendu avant premiere application : les 4 colonnes valent false, sauf droit_marches_present.
SELECT
    to_regclass('public.tenders') IS NOT NULL AS marches_deja_presents,
    to_regclass('public.tender_documents') IS NOT NULL AS pieces_deja_presents,
    to_regclass('public.tender_service_orders') IS NOT NULL AS ordres_deja_presents,
    EXISTS (SELECT 1 FROM public.permissions WHERE code = 'tenders:manage') AS droit_marches_present;

-- 2. GARDE D'APPLICATION
SELECT set_config('bell.confirme_026', 'non', false);

DO $garde$
BEGIN
    IF coalesce(current_setting('bell.confirme_026', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_026 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$garde$;

BEGIN;

-- 3. ANCHRES : le droit cible et les deux fonctions de security que la RLS appelle doivent tenir.
DO $ancre$
DECLARE
    v_droit BOOLEAN;
    v_has_permission BOOLEAN;
    v_audit_function BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.permissions WHERE code = 'tenders:manage') INTO v_droit;
    IF NOT v_droit THEN
        RAISE EXCEPTION 'Ancre droit absente : la permission tenders:manage est introuvable.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS (SELECT 1 FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'has_permission') INTO v_has_permission;
    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Ancre fonction absente : public.has_permission est introuvable.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS (SELECT 1 FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'audit_trigger_func') INTO v_audit_function;
    IF NOT v_audit_function THEN
        RAISE EXCEPTION 'Ancre fonction absente : public.audit_trigger_func est introuvable.'
            USING ERRCODE = 'P0001';
    END IF;
END
$ancre$;

-- 4. TABLE DES APPELS D'OFFRES ET MARCHES
CREATE TABLE IF NOT EXISTS public.tenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    contracting_authority VARCHAR(200),
    source VARCHAR(120),
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

-- 5. TABLE DES PIECES DU DOSSIER
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

-- 6. TABLE DES ORDRES DE SERVICE, AVENANTS ET DECOMPTES
CREATE TABLE IF NOT EXISTS public.tender_service_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
    reference VARCHAR(50) NOT NULL,
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

-- 7. POLITIQUES RLS
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tender_service_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenders_lecture ON public.tenders;
CREATE POLICY tenders_lecture ON public.tenders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tenders_creation ON public.tenders;
CREATE POLICY tenders_creation ON public.tenders FOR INSERT TO authenticated
WITH CHECK (public.has_permission('tenders:manage'));

DROP POLICY IF EXISTS tenders_modification ON public.tenders;
CREATE POLICY tenders_modification ON public.tenders FOR UPDATE TO authenticated
USING (public.has_permission('tenders:manage') OR assigned_to = auth.uid() OR created_by = auth.uid())
WITH CHECK (public.has_permission('tenders:manage') OR assigned_to = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS tenders_suppression_direction ON public.tenders;
CREATE POLICY tenders_suppression_direction ON public.tenders FOR DELETE TO authenticated
USING (public.get_auth_role() IN ('directeur_general', 'super_admin'));

DROP POLICY IF EXISTS tender_documents_lecture ON public.tender_documents;
CREATE POLICY tender_documents_lecture ON public.tender_documents FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tender_documents_creation ON public.tender_documents;
CREATE POLICY tender_documents_creation ON public.tender_documents FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS tender_documents_modification ON public.tender_documents;
CREATE POLICY tender_documents_modification ON public.tender_documents FOR UPDATE TO authenticated
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
CREATE POLICY tender_documents_suppression ON public.tender_documents FOR DELETE TO authenticated
USING (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS tender_service_orders_lecture ON public.tender_service_orders;
CREATE POLICY tender_service_orders_lecture ON public.tender_service_orders FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tender_service_orders_creation ON public.tender_service_orders;
CREATE POLICY tender_service_orders_creation ON public.tender_service_orders FOR INSERT TO authenticated
WITH CHECK (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS tender_service_orders_modification ON public.tender_service_orders;
CREATE POLICY tender_service_orders_modification ON public.tender_service_orders FOR UPDATE TO authenticated
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
CREATE POLICY tender_service_orders_suppression ON public.tender_service_orders FOR DELETE TO authenticated
USING (
    public.has_permission('tenders:manage')
    OR EXISTS (
        SELECT 1 FROM public.tenders AS t
        WHERE t.id = tender_id AND (t.assigned_to = auth.uid() OR t.created_by = auth.uid())
    )
);

-- 8. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_tenders ON public.tenders;
CREATE TRIGGER trg_audit_tenders AFTER INSERT OR UPDATE OR DELETE ON public.tenders
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_tender_documents ON public.tender_documents;
CREATE TRIGGER trg_audit_tender_documents AFTER INSERT OR UPDATE OR DELETE ON public.tender_documents
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_tender_service_orders ON public.tender_service_orders;
CREATE TRIGGER trg_audit_tender_service_orders AFTER INSERT OR UPDATE OR DELETE ON public.tender_service_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- 9. CONTROLE DE COHERENCE AVANT COMMIT : tout est annule si une piece manque.
DO $controle$
DECLARE
    v_policies_tenders INTEGER;
    v_policies_documents INTEGER;
    v_policies_orders INTEGER;
    v_triggers INTEGER;
    v_checks INTEGER;
    v_indexes INTEGER;
    v_uniques INTEGER;
    v_cascades INTEGER;
BEGIN
    SELECT count(*) INTO v_policies_tenders FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenders';
    IF v_policies_tenders <> 4 THEN
        RAISE EXCEPTION 'Policies tenders : 4 attendues, % trouvees.', v_policies_tenders
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_policies_documents FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tender_documents';
    IF v_policies_documents <> 4 THEN
        RAISE EXCEPTION 'Policies tender_documents : 4 attendues, % trouvees.', v_policies_documents
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_policies_orders FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tender_service_orders';
    IF v_policies_orders <> 4 THEN
        RAISE EXCEPTION 'Policies tender_service_orders : 4 attendues, % trouvees.', v_policies_orders
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_triggers FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.relid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tginternal
      AND t.tgname IN ('trg_audit_tenders', 'trg_audit_tender_documents',
                       'trg_audit_tender_service_orders');
    IF v_triggers <> 3 THEN
        RAISE EXCEPTION 'Triggers d audit : 3 attendus, % trouves.', v_triggers USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_checks FROM pg_constraint WHERE connamespace = 'public'::regnamespace
      AND contype = 'c' AND conname IN
      ('chk_tender_method', 'chk_tender_status', 'chk_tender_deadline', 'chk_tender_advance',
       'chk_tender_execution_delay', 'chk_tender_doc_category', 'chk_tender_doc_status',
       'chk_tender_so_type', 'chk_tender_so_status');
    IF v_checks <> 9 THEN
        RAISE EXCEPTION 'Contraintes de domaine : 9 attendues, % trouvees.', v_checks
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_indexes FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN
              ('tenders', 'tender_documents', 'tender_service_orders')
      AND indexname IN ('idx_tenders_status', 'idx_tenders_deadline', 'idx_tenders_assigned',
                        'idx_tender_documents_tender', 'idx_tender_service_orders_tender');
    IF v_indexes <> 5 THEN
        RAISE EXCEPTION 'Index : 5 attendus, % trouves.', v_indexes USING ERRCODE = 'P0001';
    END IF;

    -- Deux pieces ne peuvent pas coexister deux fois dans le meme dossier, ni deux ordres porter
    -- la meme reference : sans ces cles, le canevas et les decomptes se dupliqueraient.
    SELECT count(*) INTO v_uniques FROM pg_constraint WHERE connamespace = 'public'::regnamespace
      AND contype = 'u' AND conname IN ('uq_tender_document', 'uq_tender_service_order');
    IF v_uniques <> 2 THEN
        RAISE EXCEPTION 'Cles uniques nommees : 2 attendues, % trouvees.', v_uniques
            USING ERRCODE = 'P0001';
    END IF;

    -- La piece et l'ordre doivent mourir avec le marche : sans DELETE CASCADE, la suppression
    -- rendrait une erreur et laisserait des orphelins.
    SELECT count(*) INTO v_cascades FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND contype = 'f'
      AND conrelid IN ('public.tender_documents'::regclass, 'public.tender_service_orders'::regclass)
      AND confdeltype = 'c';
    IF v_cascades <> 2 THEN
        RAISE EXCEPTION 'Cle etrangere cascade : 2 attendues, % trouvees.', v_cascades
            USING ERRCODE = 'P0001';
    END IF;
END
$controle$;

COMMIT;

-- 10. CERTIFICATION (LECTURE SEULE, 1 ligne) :
--   attendu : marche_policies_ok, piece_policies_ok, ordre_policies_ok, rls_active, audit_branche,
--             domaine_cadre, unique_cadre, cascade_ok, matrice_inchangee valent true.
SELECT
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenders') = 4 AS marche_policies_ok,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tender_documents') = 4 AS piece_policies_ok,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tender_service_orders') = 4 AS ordre_policies_ok,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('tenders', 'tender_documents', 'tender_service_orders')
        AND c.relrowsecurity) = 3 AS rls_active,
    (SELECT count(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tginternal
        AND t.tgname IN ('trg_audit_tenders', 'trg_audit_tender_documents',
                         'trg_audit_tender_service_orders')) = 3 AS audit_branche,
    (SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'c'
      AND conname IN ('chk_tender_method', 'chk_tender_status', 'chk_tender_deadline',
                      'chk_tender_advance', 'chk_tender_execution_delay', 'chk_tender_doc_category',
                      'chk_tender_doc_status', 'chk_tender_so_type', 'chk_tender_so_status')) = 9 AS domaine_cadre,
    (SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'u'
      AND conname IN ('uq_tender_document', 'uq_tender_service_order')) = 2 AS unique_cadre,
    (SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f'
      AND conrelid IN ('public.tender_documents'::regclass, 'public.tender_service_orders'::regclass)
      AND confdeltype = 'c') = 2 AS cascade_ok,
    (SELECT count(*) FROM public.role_permissions
      WHERE permission_id IN (SELECT id FROM public.permissions WHERE code = 'tenders:manage')) = 2 AS matrice_inchangee;
