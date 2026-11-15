-- BELL-MMS : Migration 024 - Agenda, Tâches & Suivi des Collaborateurs
-- Le menu /tasks était un placeholder sans table : ce lot crée le domaine, ses droits et son audit.

-- 1. NOUVELLES PERMISSIONS
-- Les libelles sont en ASCII : le collage se fait par le presse-papiers, et toute derive d'encodage
-- se graverait dans la table permissions.
INSERT INTO public.permissions (code, module, name, description) VALUES
('tasks:manage', 'tasks', 'Gerer les taches', 'Creer, affecter, avancer et cloturer les taches'),
('agenda:manage', 'agenda', 'Gerer l''agenda partage', 'Poser et modifier les visites, rendez-vous et receptions')
ON CONFLICT (code) DO NOTHING;

-- 2. ATTRIBUTION AUX RÔLES
-- Le collaborateur exécute ses tâches mais ne pose pas l'agenda ; la secrétaire tient les deux ;
-- le DG tient les deux sans droit de suppression réservé, la suppression restant direction + système.
DO $$
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
END $$;

-- 3. TABLE DES TÂCHES
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'TSK-2026-001'
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'a_faire', -- 'a_faire', 'en_cours', 'en_attente', 'bloque', 'termine', 'annule'
    priority VARCHAR(20) NOT NULL DEFAULT 'normale', -- 'basse', 'normale', 'haute', 'urgente'
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

-- 4. TABLE DE L'AGENDA PARTAGÉ
CREATE TABLE IF NOT EXISTS public.agenda_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'AGR-2026-001'
    title VARCHAR(200) NOT NULL,
    description TEXT,
    event_type VARCHAR(50) NOT NULL DEFAULT 'autre', -- 'visite_terrain', 'rdv_notaire', 'rdv_client', 'reception_travaux', 'relance_paiement', 'autre'
    status VARCHAR(30) NOT NULL DEFAULT 'planifie', -- 'planifie', 'confirme', 'realise', 'annule'
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

-- 5. POLITIQUES RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur authentifié voit l'agenda et les tâches : c'est un outil de suivi commun.
DROP POLICY IF EXISTS tasks_lecture ON public.tasks;
CREATE POLICY tasks_lecture
ON public.tasks FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS tasks_creation ON public.tasks;
CREATE POLICY tasks_creation
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (public.has_permission('tasks:manage'));

-- Le porteur du droit corrige n'importe quelle tâche ; un collaborateur corrige uniquement les siennes.
DROP POLICY IF EXISTS tasks_modification ON public.tasks;
CREATE POLICY tasks_modification
ON public.tasks FOR UPDATE TO authenticated
USING (
    public.has_permission('tasks:manage')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
)
WITH CHECK (
    public.has_permission('tasks:manage')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
);

DROP POLICY IF EXISTS tasks_suppression_direction ON public.tasks;
CREATE POLICY tasks_suppression_direction
ON public.tasks FOR DELETE TO authenticated
USING (public.get_auth_role() IN ('directeur_general', 'super_admin'));

DROP POLICY IF EXISTS agenda_lecture ON public.agenda_events;
CREATE POLICY agenda_lecture
ON public.agenda_events FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS agenda_creation ON public.agenda_events;
CREATE POLICY agenda_creation
ON public.agenda_events FOR INSERT TO authenticated
WITH CHECK (public.has_permission('agenda:manage'));

DROP POLICY IF EXISTS agenda_modification ON public.agenda_events;
CREATE POLICY agenda_modification
ON public.agenda_events FOR UPDATE TO authenticated
USING (
    public.has_permission('agenda:manage')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
)
WITH CHECK (
    public.has_permission('agenda:manage')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
);

DROP POLICY IF EXISTS agenda_suppression_direction ON public.agenda_events;
CREATE POLICY agenda_suppression_direction
ON public.agenda_events FOR DELETE TO authenticated
USING (public.get_auth_role() IN ('directeur_general', 'super_admin'));

-- 6. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_tasks ON public.tasks;
CREATE TRIGGER trg_audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_agenda_events ON public.agenda_events;
CREATE TRIGGER trg_audit_agenda_events AFTER INSERT OR UPDATE OR DELETE ON public.agenda_events
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
