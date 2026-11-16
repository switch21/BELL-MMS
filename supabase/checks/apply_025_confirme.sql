-- Meme contenu que supabase/migrations/025_work_projects_schema.sql, avec le garde-fou de
-- confirmation et un controle de coherence avant COMMIT, pour un collage dans l'editeur SQL du
-- tableau de bord. Ne jamais coller les deux : celui-ci est la voie unique.
--
-- Les ecrites ne partent que si bell.confirme_025 vaut 'oui'. Sans ce passage, le script ne
-- touche rien et rend une erreur.
--
-- Objet : raccorder le menu /projects (Travaux, Amenagement & Viabilisation), jusqu'ici placeholder
-- sans aucune table. Cree work_projects et work_project_steps, leur RLS et leur audit.
-- Aucun droit nouveau : projects:manage existe deja et ne change pas de proprietaire.
-- Attendu apres application : 2 tables, 8 policies, 2 triggers d'audit, 5 contraintes de domaine,
-- 5 index, total_matrice inchange.

-- 1. PRE-VOL LECTURE SEULE (ne transforme rien) : etat avant collage.
-- Attendu avant premiere application : les 3 colonnes valent false.
SELECT
    to_regclass('public.work_projects') IS NOT NULL AS chantiers_deja_presents,
    to_regclass('public.work_project_steps') IS NOT NULL AS etapes_deja_presents,
    EXISTS (SELECT 1 FROM public.permissions WHERE code = 'projects:manage') AS droit_chantiers_present;

-- 2. GARDE D'APPLICATION
SELECT set_config('bell.confirme_025', 'non', false);

DO $garde$
BEGIN
    IF coalesce(current_setting('bell.confirme_025', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_025 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$garde$;

BEGIN;

-- 3. ANCHRES : les tables cibles des cles etrangeres et le droit existant doivent tenir.
DO $ancre$
DECLARE
    v_clients BOOLEAN;
    v_plots BOOLEAN;
    v_droit BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'clients') INTO v_clients;
    IF NOT v_clients THEN
        RAISE EXCEPTION 'Ancre clients absente : la table public.clients est introuvable.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'plots') INTO v_plots;
    IF NOT v_plots THEN
        RAISE EXCEPTION 'Ancre plots absente : la table public.plots est introuvable.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.permissions WHERE code = 'projects:manage') INTO v_droit;
    IF NOT v_droit THEN
        RAISE EXCEPTION 'Ancre droit absente : la permission projects:manage est introuvable.'
            USING ERRCODE = 'P0001';
    END IF;
END
$ancre$;

-- 4. TABLE DES CHANTIERS
CREATE TABLE IF NOT EXISTS public.work_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL,
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

-- 5. TABLE DES ETAPES DE CHANTIER
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

-- 6. RLS
ALTER TABLE public.work_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_project_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_projects_lecture ON public.work_projects;
CREATE POLICY work_projects_lecture ON public.work_projects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS work_projects_creation ON public.work_projects;
CREATE POLICY work_projects_creation ON public.work_projects FOR INSERT TO authenticated
WITH CHECK (public.has_permission('projects:manage'));

DROP POLICY IF EXISTS work_projects_modification ON public.work_projects;
CREATE POLICY work_projects_modification ON public.work_projects FOR UPDATE TO authenticated
USING (public.has_permission('projects:manage') OR assigned_to = auth.uid() OR created_by = auth.uid())
WITH CHECK (public.has_permission('projects:manage') OR assigned_to = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS work_projects_suppression_direction ON public.work_projects;
CREATE POLICY work_projects_suppression_direction ON public.work_projects FOR DELETE TO authenticated
USING (public.get_auth_role() IN ('directeur_general', 'super_admin'));

DROP POLICY IF EXISTS work_steps_lecture ON public.work_project_steps;
CREATE POLICY work_steps_lecture ON public.work_project_steps FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS work_steps_creation ON public.work_project_steps;
CREATE POLICY work_steps_creation ON public.work_project_steps FOR INSERT TO authenticated
WITH CHECK (public.has_permission('projects:manage'));

DROP POLICY IF EXISTS work_steps_modification ON public.work_project_steps;
CREATE POLICY work_steps_modification ON public.work_project_steps FOR UPDATE TO authenticated
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
CREATE POLICY work_steps_suppression ON public.work_project_steps FOR DELETE TO authenticated
USING (public.has_permission('projects:manage'));

-- 7. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_work_projects ON public.work_projects;
CREATE TRIGGER trg_audit_work_projects AFTER INSERT OR UPDATE OR DELETE ON public.work_projects
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_work_project_steps ON public.work_project_steps;
CREATE TRIGGER trg_audit_work_project_steps AFTER INSERT OR UPDATE OR DELETE ON public.work_project_steps
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- 8. CONTROLE DE COHERENCE AVANT COMMIT : tout est annule si une piece manque.
DO $controle$
DECLARE
    v_policies_projects INTEGER;
    v_policies_steps INTEGER;
    v_triggers INTEGER;
    v_checks INTEGER;
    v_indexes INTEGER;
    v_fk_steps INTEGER;
BEGIN
    SELECT count(*) INTO v_policies_projects FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_projects';
    IF v_policies_projects <> 4 THEN
        RAISE EXCEPTION 'Policies work_projects : 4 attendues, % trouvees.', v_policies_projects
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_policies_steps FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_project_steps';
    IF v_policies_steps <> 4 THEN
        RAISE EXCEPTION 'Policies work_project_steps : 4 attendues, % trouvees.', v_policies_steps
            USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_triggers FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.relid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tginternal
      AND t.tgname IN ('trg_audit_work_projects', 'trg_audit_work_project_steps');
    IF v_triggers <> 2 THEN
        RAISE EXCEPTION 'Triggers d audit : 2 attendus, % trouves.', v_triggers USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_checks FROM pg_constraint WHERE connamespace = 'public'::regnamespace
      AND contype = 'c' AND conname IN
      ('chk_work_project_type', 'chk_work_project_status', 'chk_work_project_reception',
       'chk_work_project_dates', 'chk_work_step_status');
    IF v_checks <> 5 THEN
        RAISE EXCEPTION 'Contraintes de domaine : 5 attendues, % trouvees.', v_checks USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_indexes FROM pg_indexes
    WHERE schemaname = 'public' AND tablename IN ('work_projects', 'work_project_steps')
      AND indexname IN ('idx_work_projects_status', 'idx_work_projects_assigned',
                        'idx_work_projects_client', 'idx_work_projects_plot',
                        'idx_work_project_steps_project');
    IF v_indexes <> 5 THEN
        RAISE EXCEPTION 'Index : 5 attendus, % trouves.', v_indexes USING ERRCODE = 'P0001';
    END IF;

    -- L'etape doit mourir avec son chantier : sans DELETE CASCADE, la suppression DG laisserait
    -- des orphelins et refuserait la suppression.
    SELECT count(*) INTO v_fk_steps FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND contype = 'f'
      AND conrelid = 'public.work_project_steps'::regclass AND confdeltype = 'c';
    IF v_fk_steps <> 1 THEN
        RAISE EXCEPTION 'Cle etrangere etapes : 1 cascade attendue, % trouvee.', v_fk_steps
            USING ERRCODE = 'P0001';
    END IF;
END
$controle$;

COMMIT;

-- 9. CERTIFICATION (LECTURE SEULE, 1 ligne) :
--   attendu : chantier_policies_ok, etape_policies_ok, rls_active, audit_branche, domaine_cadre,
--             cascade_ok, matrice_inchangee valent true.
SELECT
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'work_projects') = 4 AS chantier_policies_ok,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'work_project_steps') = 4 AS etape_policies_ok,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('work_projects', 'work_project_steps')
        AND c.relrowsecurity) = 2 AS rls_active,
    (SELECT count(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tginternal
        AND t.tgname IN ('trg_audit_work_projects', 'trg_audit_work_project_steps')) = 2 AS audit_branche,
    (SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'c'
      AND conname IN ('chk_work_project_type', 'chk_work_project_status', 'chk_work_project_reception',
                      'chk_work_project_dates', 'chk_work_step_status')) = 5 AS domaine_cadre,
    (SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f'
      AND conrelid = 'public.work_project_steps'::regclass AND confdeltype = 'c') = 1 AS cascade_ok,
    (SELECT count(*) FROM public.role_permissions
      WHERE permission_id IN (SELECT id FROM public.permissions WHERE code = 'projects:manage')) = 2 AS matrice_inchangee;
