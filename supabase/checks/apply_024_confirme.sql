-- Meme contenu que supabase/migrations/024_tasks_and_agenda_schema.sql, avec le garde-fou de
-- confirmation et un controle de coherence avant COMMIT, pour un collage dans l'editeur SQL du
-- tableau de bord. Ne jamais coller les deux : celui-ci est la voie unique.
-- Les ecrites ne partent que si bell.confirme_024 vaut 'oui'. Sans ce passage, le script ne
-- touche rien et rend une erreur.
--
-- Objet : raccorder le menu /tasks (Agenda, Taches et suivi des collaborateurs), jusqu'ici
-- placeholder sans aucune table. Cree tasks et agenda_events, leurs droits, leur RLS et leur audit.
-- Attendu apres application : 2 tables, 8 policies, 2 triggers d'audit, 2 permissions, 7 lignes
-- de matrice en plus (67 -> 74).

-- 1. PRE-VOL LECTURE SEULE (ne transforme rien) : etat avant collage.
-- Attendu avant premiere application : les 4 colonnes valent false et total_matrice = 67.
SELECT
    to_regclass('public.tasks') IS NOT NULL AS taches_deja_presentes,
    to_regclass('public.agenda_events') IS NOT NULL AS agenda_deja_present,
    EXISTS (SELECT 1 FROM public.permissions WHERE code = 'tasks:manage') AS droit_taches_deja_present,
    EXISTS (SELECT 1 FROM public.permissions WHERE code = 'agenda:manage') AS droit_agenda_deja_present,
    (SELECT count(*) FROM public.role_permissions) AS total_matrice;

-- 2. GARDE D'APPLICATION
SELECT set_config('bell.confirme_024', 'non', false);

DO $garde$
BEGIN
    IF coalesce(current_setting('bell.confirme_024', true), '') <> 'oui' THEN
        RAISE EXCEPTION 'Application non confirmee : remplacer bell.confirme_024 par oui.'
            USING ERRCODE = 'P0001';
    END IF;
END
$garde$;

BEGIN;

-- 3. ANCHRES : les 4 roles systeme et la table clients (cible des cles etrangeres) doivent exister.
DO $ancre$
DECLARE
    v_roles INTEGER;
    v_clients BOOLEAN;
BEGIN
    SELECT count(*) INTO v_roles FROM public.roles
    WHERE code IN ('super_admin', 'directeur_general', 'secretaire', 'collaborateur');
    IF v_roles <> 4 THEN
        RAISE EXCEPTION 'Ancre roles invalide : 4 roles systeme attends, % trouves.', v_roles
            USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'clients') INTO v_clients;
    IF NOT v_clients THEN
        RAISE EXCEPTION 'Ancre clients absente : la table public.clients est introuvable.'
            USING ERRCODE = 'P0001';
    END IF;
END
$ancre$;

-- 4. NOUVELLES PERMISSIONS
INSERT INTO public.permissions (code, module, name, description) VALUES
('tasks:manage', 'tasks', 'Gerer les taches', 'Creer, affecter, avancer et cloturer les taches'),
('agenda:manage', 'agenda', 'Gerer l''agenda partage', 'Poser et modifier les visites, rendez-vous et receptions')
ON CONFLICT (code) DO NOTHING;

-- 5. ATTRIBUTION AUX ROLES
DO $grants$
DECLARE
    r_super_admin UUID;
    r_dg UUID;
    r_secretaire UUID;
    r_collab UUID;
BEGIN
    SELECT id INTO r_super_admin FROM public.roles WHERE code = 'super_admin';
    SELECT id INTO r_dg FROM public.roles WHERE code = 'directeur_general';
    SELECT id INTO r_secretaire FROM public.roles WHERE code = 'secretaire';
    SELECT id INTO r_collab FROM public.roles WHERE code = 'collaborateur';

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_super_admin, id FROM public.permissions
    WHERE code IN ('tasks:manage', 'agenda:manage')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_dg, id FROM public.permissions
    WHERE code IN ('tasks:manage', 'agenda:manage')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_secretaire, id FROM public.permissions
    WHERE code IN ('tasks:manage', 'agenda:manage')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_collab, id FROM public.permissions
    WHERE code IN ('tasks:manage')
    ON CONFLICT DO NOTHING;
END
$grants$;

-- 6. TABLE DES TACHES
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'a_faire',
    priority VARCHAR(20) NOT NULL DEFAULT 'normale',
    due_date DATE,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to_name VARCHAR(200),
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(200),
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_task_status CHECK (status IN ('a_faire', 'en_cours', 'en_attente', 'bloque', 'termine', 'annule')),
    CONSTRAINT chk_task_priority CHECK (priority IN ('basse', 'normale', 'haute', 'urgente'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);

-- 7. TABLE DE L'AGENDA PARTAGE
CREATE TABLE IF NOT EXISTS public.agenda_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL DEFAULT 'autre',
    status VARCHAR(30) NOT NULL DEFAULT 'planifie',
    location VARCHAR(200),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to_name VARCHAR(200),
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_agenda_event_type CHECK (
        event_type IN ('visite_terrain', 'rdv_notaire', 'rdv_client', 'reception_travaux', 'relance_paiement', 'autre')
    ),
    CONSTRAINT chk_agenda_status CHECK (status IN ('planifie', 'confirme', 'realise', 'annule')),
    CONSTRAINT chk_agenda_slot CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_agenda_starts ON public.agenda_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_agenda_assigned ON public.agenda_events(assigned_to);

-- 8. RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_lecture ON public.tasks;
CREATE POLICY tasks_lecture ON public.tasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tasks_creation ON public.tasks;
CREATE POLICY tasks_creation ON public.tasks FOR INSERT TO authenticated
WITH CHECK (public.has_permission('tasks:manage'));

DROP POLICY IF EXISTS tasks_modification ON public.tasks;
CREATE POLICY tasks_modification ON public.tasks FOR UPDATE TO authenticated
USING (public.has_permission('tasks:manage') OR assigned_to = auth.uid() OR created_by = auth.uid())
WITH CHECK (public.has_permission('tasks:manage') OR assigned_to = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS tasks_suppression_direction ON public.tasks;
CREATE POLICY tasks_suppression_direction ON public.tasks FOR DELETE TO authenticated
USING (public.get_auth_role() IN ('directeur_general', 'super_admin'));

DROP POLICY IF EXISTS agenda_lecture ON public.agenda_events;
CREATE POLICY agenda_lecture ON public.agenda_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS agenda_creation ON public.agenda_events;
CREATE POLICY agenda_creation ON public.agenda_events FOR INSERT TO authenticated
WITH CHECK (public.has_permission('agenda:manage'));

DROP POLICY IF EXISTS agenda_modification ON public.agenda_events;
CREATE POLICY agenda_modification ON public.agenda_events FOR UPDATE TO authenticated
USING (public.has_permission('agenda:manage') OR assigned_to = auth.uid() OR created_by = auth.uid())
WITH CHECK (public.has_permission('agenda:manage') OR assigned_to = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS agenda_suppression_direction ON public.agenda_events;
CREATE POLICY agenda_suppression_direction ON public.agenda_events FOR DELETE TO authenticated
USING (public.get_auth_role() IN ('directeur_general', 'super_admin'));

-- 9. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_tasks ON public.tasks;
CREATE TRIGGER trg_audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_agenda_events ON public.agenda_events;
CREATE TRIGGER trg_audit_agenda_events AFTER INSERT OR UPDATE OR DELETE ON public.agenda_events
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- 10. CONTROLE DE COHERENCE AVANT COMMIT : tout est annule si une piece manque.
DO $controle$
DECLARE
    v_policies_tasks INTEGER;
    v_policies_agenda INTEGER;
    v_triggers INTEGER;
    v_checks INTEGER;
    v_grants INTEGER;
BEGIN
    SELECT count(*) INTO v_policies_tasks FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks';
    IF v_policies_tasks <> 4 THEN
        RAISE EXCEPTION 'Policies tasks : 4 attendues, % trouvees.', v_policies_tasks USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_policies_agenda FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agenda_events';
    IF v_policies_agenda <> 4 THEN
        RAISE EXCEPTION 'Policies agenda_events : 4 attendues, % trouvees.', v_policies_agenda USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_triggers FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.relid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tginternal
      AND t.tgname IN ('trg_audit_tasks', 'trg_audit_agenda_events');
    IF v_triggers <> 2 THEN
        RAISE EXCEPTION 'Triggers d audit : 2 attendus, % trouves.', v_triggers USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_checks FROM pg_constraint WHERE connamespace = 'public'::regnamespace
      AND contype = 'c' AND conname IN
      ('chk_task_status', 'chk_task_priority', 'chk_agenda_event_type', 'chk_agenda_status', 'chk_agenda_slot');
    IF v_checks <> 5 THEN
        RAISE EXCEPTION 'Contraintes de domaine : 5 attendues, % trouvees.', v_checks USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO v_grants FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE p.code IN ('tasks:manage', 'agenda:manage');
    IF v_grants <> 7 THEN
        RAISE EXCEPTION 'Droits distribues : 7 attendus, % trouves.', v_grants USING ERRCODE = 'P0001';
    END IF;
END
$controle$;

COMMIT;

-- 11. CERTIFICATION (LECTURE SEULE, 1 ligne) :
--   attendu : taches_policies_ok, agenda_policies_ok, rls_active, audit_branche, droits_distribues
--             valent true, et total_matrice = 74.
SELECT
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tasks') = 4 AS taches_policies_ok,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agenda_events') = 4 AS agenda_policies_ok,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('tasks', 'agenda_events') AND c.relrowsecurity) = 2 AS rls_active,
    (SELECT count(*) FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.relid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tginternal
        AND t.tgname IN ('trg_audit_tasks', 'trg_audit_agenda_events')) = 2 AS audit_branche,
    (SELECT count(*) FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE p.code IN ('tasks:manage', 'agenda:manage')) = 7 AS droits_distribues,
    (SELECT count(*) FROM public.role_permissions) AS total_matrice;
