-- BELL-MMS : Migration 025 - Travaux, Amenagement & Viabilisation
-- Le menu /projects etait un placeholder sans table : ce lot cree le domaine, sa RLS et son audit.
-- Aucun droit nouveau : projects:manage existe deja (p25) et n'est accorde qu'a directeur_general
-- et super_admin. Les depenses de chantier restent dans financial_transactions, ce module ne
-- duplique pas la tresorerie.

-- 1. TABLE DES CHANTIERS
CREATE TABLE IF NOT EXISTS public.work_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'TRV-2026-A1B2C3D4'
    title VARCHAR(200) NOT NULL,
    description TEXT,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    plot_id UUID REFERENCES public.plots(id) ON DELETE SET NULL,
    site_location VARCHAR(200),
    works_type VARCHAR(40) NOT NULL DEFAULT 'viabilisation',
    status VARCHAR(30) NOT NULL DEFAULT 'en_etude',
    budget_estimated NUMERIC(15, 2),
    budget_engaged NUMERIC(15, 2),
    cost_actual NUMERIC(15, 2),
    start_date DATE,
    target_end_date DATE,
    actual_end_date DATE,
    reception_status VARCHAR(30) NOT NULL DEFAULT 'non_prevue',
    reception_date DATE,
    reception_notes TEXT,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to_name VARCHAR(200),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_work_project_type CHECK (
        works_type IN ('viabilisation', 'terrassement', 'assainissement', 'cloture', 'bornage', 'amenagement')
    ),
    CONSTRAINT chk_work_project_status CHECK (
        status IN ('en_etude', 'devis_valide', 'en_cours', 'suspendu', 'termine', 'annule')
    ),
    CONSTRAINT chk_work_project_reception CHECK (
        reception_status IN ('non_prevue', 'programmee', 'acceptee', 'acceptee_avec_reserves', 'refusee')
    ),
    CONSTRAINT chk_work_project_dates CHECK (
        target_end_date IS NULL OR start_date IS NULL OR target_end_date >= start_date
    )
);

CREATE INDEX IF NOT EXISTS idx_work_projects_status ON public.work_projects(status);
CREATE INDEX IF NOT EXISTS idx_work_projects_assigned ON public.work_projects(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_projects_client ON public.work_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_work_projects_plot ON public.work_projects(plot_id);

-- 2. TABLE DES ETAPES DE CHANTIER
CREATE TABLE IF NOT EXISTS public.work_project_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.work_projects(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'en_attente',
    due_date DATE,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_by_name VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_work_step_status CHECK (status IN ('en_attente', 'en_cours', 'termine', 'signale')),
    CONSTRAINT uq_work_project_step UNIQUE (project_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_work_project_steps_project ON public.work_project_steps(project_id);

-- 3. POLITIQUES RLS
ALTER TABLE public.work_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_project_steps ENABLE ROW LEVEL SECURITY;

-- Le chantier est un objet de suivi commun : tout utilisateur authentifie le lit.
DROP POLICY IF EXISTS work_projects_lecture ON public.work_projects;
CREATE POLICY work_projects_lecture
ON public.work_projects FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS work_projects_creation ON public.work_projects;
CREATE POLICY work_projects_creation
ON public.work_projects FOR INSERT TO authenticated
WITH CHECK (public.has_permission('projects:manage'));

-- Le porteur du droit corrige n'importe quel chantier ; le porteur d'un chantier qui lui est
-- confie ou qu'il a ouvert peut le corriger aussi.
DROP POLICY IF EXISTS work_projects_modification ON public.work_projects;
CREATE POLICY work_projects_modification
ON public.work_projects FOR UPDATE TO authenticated
USING (
    public.has_permission('projects:manage')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
)
WITH CHECK (
    public.has_permission('projects:manage')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
);

DROP POLICY IF EXISTS work_projects_suppression_direction ON public.work_projects;
CREATE POLICY work_projects_suppression_direction
ON public.work_projects FOR DELETE TO authenticated
USING (public.get_auth_role() IN ('directeur_general', 'super_admin'));

DROP POLICY IF EXISTS work_steps_lecture ON public.work_project_steps;
CREATE POLICY work_steps_lecture
ON public.work_project_steps FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS work_steps_creation ON public.work_project_steps;
CREATE POLICY work_steps_creation
ON public.work_project_steps FOR INSERT TO authenticated
WITH CHECK (public.has_permission('projects:manage'));

-- L'etape se juge par le chantier parent, sinon le collaborateur porte un chantier
-- et ne peut pas en faire avancer les etapes.
DROP POLICY IF EXISTS work_steps_modification ON public.work_project_steps;
CREATE POLICY work_steps_modification
ON public.work_project_steps FOR UPDATE TO authenticated
USING (
    public.has_permission('projects:manage')
    OR EXISTS (
        SELECT 1 FROM public.work_projects AS wp
        WHERE wp.id = project_id AND (wp.assigned_to = auth.uid() OR wp.created_by = auth.uid())
    )
)
WITH CHECK (
    public.has_permission('projects:manage')
    OR EXISTS (
        SELECT 1 FROM public.work_projects AS wp
        WHERE wp.id = project_id AND (wp.assigned_to = auth.uid() OR wp.created_by = auth.uid())
    )
);

DROP POLICY IF EXISTS work_steps_suppression ON public.work_project_steps;
CREATE POLICY work_steps_suppression
ON public.work_project_steps FOR DELETE TO authenticated
USING (public.has_permission('projects:manage'));

-- 4. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_work_projects ON public.work_projects;
CREATE TRIGGER trg_audit_work_projects AFTER INSERT OR UPDATE OR DELETE ON public.work_projects
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_work_project_steps ON public.work_project_steps;
CREATE TRIGGER trg_audit_work_project_steps AFTER INSERT OR UPDATE OR DELETE ON public.work_project_steps
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
