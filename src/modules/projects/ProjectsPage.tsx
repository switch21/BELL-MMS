import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  MapPin,
  Plus,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { AuditLogEntry, UserProfile } from '../../types/auth.types';
import { Client } from '../../types/land.types';
import {
  RECEPTION_STATUS_LABELS,
  ReceptionStatus,
  WORK_PROJECT_STATUS_LABELS,
  WORK_STEP_STATUS_LABELS,
  WORK_STEPS_CANVAS,
  WORK_TYPE_LABELS,
  WorkProject,
  WorkProjectStatus,
  WorkStepStatus,
  WorkType,
  isProjectOverdue,
} from '../../types/project.types';
import {
  getStoredData,
  INITIAL_CLIENTS,
  INITIAL_PLOTS,
  INITIAL_WORK_PROJECTS,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const REFERENCE_YEAR = new Date().getFullYear();

const buildReference = (prefix: string) =>
  `${prefix}-${REFERENCE_YEAR}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
};

const formatAmount = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('fr-FR')} FCFA`;
};

const STATUS_ORDER: WorkProjectStatus[] = ['en_etude', 'devis_valide', 'en_cours', 'suspendu', 'termine', 'annule'];

const NEXT_PROJECT_STATUS: Partial<Record<WorkProjectStatus, WorkProjectStatus>> = {
  en_etude: 'devis_valide',
  devis_valide: 'en_cours',
  en_cours: 'termine',
  suspendu: 'en_cours',
};

// Cloturer une etape en ouvre une autre : la progression du chantier reste un acte distinct.
const applyStepAdvance = (
  project: WorkProject,
  step: NonNullable<WorkProject['steps']>[number],
  actorId: string | null,
  actorName: string | null,
  now: string
): WorkProject => ({
  ...project,
  updated_at: now,
  steps: (project.steps ?? []).map((item) => {
    if (item.id === step.id) {
      return {
        ...item,
        status: 'termine' as WorkStepStatus,
        completed_at: now,
        completed_by: actorId,
        completed_by_name: actorName,
        updated_at: now,
      };
    }
    if (item.step_order === step.step_order + 1 && item.status === 'en_attente') {
      return { ...item, status: 'en_cours' as WorkStepStatus, updated_at: now };
    }
    return item;
  }),
});

type BadgeVariant = 'emerald' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const PROJECT_BADGE: Record<WorkProjectStatus, BadgeVariant> = {
  en_etude: 'neutral',
  devis_valide: 'info',
  en_cours: 'warning',
  suspendu: 'danger',
  termine: 'emerald',
  annule: 'neutral',
};

const RECEPTION_BADGE: Record<ReceptionStatus, BadgeVariant> = {
  non_prevue: 'neutral',
  programmee: 'info',
  acceptee: 'emerald',
  acceptee_avec_reserves: 'warning',
  refusee: 'danger',
};

const STEP_BADGE: Record<WorkStepStatus, BadgeVariant> = {
  en_attente: 'neutral',
  en_cours: 'info',
  termine: 'emerald',
  signale: 'danger',
};

const selectClass =
  'w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs';

const fieldLabel = 'block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5';

interface PlotLite {
  id: string;
  plot_number: string;
  area_sqm: number;
}

export const ProjectsPage: React.FC = () => {
  const { currentUser, hasPermission, hasRole, usersList } = useAuth();

  const [projects, setProjects] = useState<WorkProject[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<WorkProject[]>(STORAGE_KEYS.WORK_PROJECTS, INITIAL_WORK_PROJECTS)
  );
  const [clients, setClients] = useState<Client[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Client[]>(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS)
  );
  const [plots, setPlots] = useState<PlotLite[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<PlotLite[]>(STORAGE_KEYS.PLOTS, INITIAL_PLOTS)
  );
  const [collaborators, setCollaborators] = useState<UserProfile[]>(() =>
    isSupabaseConfigured ? [] : usersList
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkProjectStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | WorkType>('all');
  const [onlyMine, setOnlyMine] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkProject | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [worksType, setWorksType] = useState<WorkType>('viabilisation');
  const [status, setStatus] = useState<WorkProjectStatus>('en_etude');
  const [siteLocation, setSiteLocation] = useState('');
  const [budgetEstimated, setBudgetEstimated] = useState('');
  const [budgetEngaged, setBudgetEngaged] = useState('');
  const [costActual, setCostActual] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetEndDate, setTargetEndDate] = useState('');
  const [actualEndDate, setActualEndDate] = useState('');
  const [receptionStatus, setReceptionStatus] = useState<ReceptionStatus>('non_prevue');
  const [receptionDate, setReceptionDate] = useState('');
  const [receptionNotes, setReceptionNotes] = useState('');
  const [assignee, setAssignee] = useState('');
  const [clientId, setClientId] = useState('');
  const [plotId, setPlotId] = useState('');
  const [notes, setNotes] = useState('');

  const [detailProject, setDetailProject] = useState<WorkProject | null>(null);

  const canManage = hasPermission('projects:manage');
  const canDelete = hasRole(['directeur_general', 'super_admin']);

  const displayName = (user?: UserProfile | null) =>
    user ? `${user.first_name} ${user.last_name}`.trim() : 'Non affecté';

  const mergeSteps = (rows: WorkProject[], steps: WorkProject['steps']): WorkProject[] =>
    rows.map((project) => ({
      ...project,
      steps: (steps ?? [])
        .filter((step) => step.project_id === project.id)
        .sort((a, b) => a.step_order - b.step_order),
    }));

  const loadConnectedData = async () => {
    const [projectsResult, stepsResult, clientsResult, plotsResult, profilesResult] = await Promise.all([
      supabase.from('work_projects').select('*').order('created_at', { ascending: false }),
      supabase.from('work_project_steps').select('*').order('step_order'),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('plots').select('id, plot_number, area_sqm').order('plot_number'),
      supabase.from('profiles').select('*').order('last_name'),
    ]);

    if (projectsResult.error) throw projectsResult.error;
    if (stepsResult.error) throw stepsResult.error;
    if (clientsResult.error) throw clientsResult.error;
    if (plotsResult.error) throw plotsResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const merged = mergeSteps(
      (projectsResult.data ?? []) as WorkProject[],
      (stepsResult.data ?? []) as WorkProject['steps']
    );
    setProjects(merged);
    setClients((clientsResult.data ?? []) as Client[]);
    setPlots((plotsResult.data ?? []) as PlotLite[]);
    setCollaborators((profilesResult.data ?? []) as UserProfile[]);
    return merged;
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    setIsLoading(true);
    loadConnectedData()
      .catch((error: unknown) => {
        console.error('[Supabase] Impossible de charger les chantiers :', error);
        if (active) {
          setDataError(
            'Impossible de charger les chantiers depuis Supabase. Vérifiez la connexion, la migration 025 et vos droits.'
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return projects.filter((project) => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false;
      if (typeFilter !== 'all' && project.works_type !== typeFilter) return false;
      if (onlyMine && project.assigned_to !== currentUser?.id) return false;
      if (!term) return true;
      return (
        project.title.toLowerCase().includes(term) ||
        (project.reference ?? '').toLowerCase().includes(term) ||
        (project.site_location ?? '').toLowerCase().includes(term) ||
        (project.assigned_to_name ?? '').toLowerCase().includes(term)
      );
    });
  }, [projects, statusFilter, typeFilter, onlyMine, searchTerm, currentUser?.id]);

  const runningCount = useMemo(
    () => projects.filter((project) => project.status === 'en_cours').length,
    [projects]
  );
  const overdueCount = useMemo(() => projects.filter(isProjectOverdue).length, [projects]);
  const pendingReceptionCount = useMemo(
    () => projects.filter((project) => project.reception_status === 'programmee').length,
    [projects]
  );
  const engagedTotal = useMemo(
    () => projects.reduce((sum, project) => sum + Number(project.budget_engaged ?? 0), 0),
    [projects]
  );

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setWorksType('viabilisation');
    setStatus('en_etude');
    setSiteLocation('');
    setBudgetEstimated('');
    setBudgetEngaged('');
    setCostActual('');
    setStartDate('');
    setTargetEndDate('');
    setActualEndDate('');
    setReceptionStatus('non_prevue');
    setReceptionDate('');
    setReceptionNotes('');
    setAssignee(currentUser?.id ?? '');
    setClientId('');
    setPlotId('');
    setNotes('');
  };

  const openForm = (project?: WorkProject) => {
    setDataError(null);
    if (project) {
      setEditing(project);
      setTitle(project.title);
      setDescription(project.description ?? '');
      setWorksType(project.works_type);
      setStatus(project.status);
      setSiteLocation(project.site_location ?? '');
      setBudgetEstimated(project.budget_estimated?.toString() ?? '');
      setBudgetEngaged(project.budget_engaged?.toString() ?? '');
      setCostActual(project.cost_actual?.toString() ?? '');
      setStartDate(project.start_date ?? '');
      setTargetEndDate(project.target_end_date ?? '');
      setActualEndDate(project.actual_end_date ?? '');
      setReceptionStatus(project.reception_status);
      setReceptionDate(project.reception_date ?? '');
      setReceptionNotes(project.reception_notes ?? '');
      setAssignee(project.assigned_to ?? '');
      setClientId(project.client_id ?? '');
      setPlotId(project.plot_id ?? '');
      setNotes(project.notes ?? '');
    } else {
      resetForm();
    }
    setIsFormOpen(true);
  };

  const numericOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/\s/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setDataError(null);

    if (startDate && targetEndDate && new Date(targetEndDate) < new Date(startDate)) {
      setDataError('La fin prévisionnelle ne peut pas précéder le début du chantier.');
      return;
    }

    setIsSaving(true);

    const person = collaborators.find((user) => user.id === assignee) || null;
    const now = new Date().toISOString();
    const payload = {
      title,
      description: description || null,
      site_location: siteLocation || null,
      works_type: worksType,
      status,
      budget_estimated: numericOrNull(budgetEstimated),
      budget_engaged: numericOrNull(budgetEngaged),
      cost_actual: numericOrNull(costActual),
      start_date: startDate || null,
      target_end_date: targetEndDate || null,
      actual_end_date: actualEndDate || null,
      reception_status: receptionStatus,
      reception_date: receptionDate || null,
      reception_notes: receptionNotes || null,
      assigned_to: assignee || null,
      assigned_to_name: person ? displayName(person) : null,
      client_id: clientId || null,
      plot_id: plotId || null,
      notes: notes || null,
      updated_at: now,
    };

    try {
      if (isSupabaseConfigured) {
        if (editing) {
          const { error } = await supabase.from('work_projects').update(payload).eq('id', editing.id);
          if (error) throw error;
        } else {
          const { data: created, error } = await supabase
            .from('work_projects')
            .insert({
              ...payload,
              reference: buildReference('TRV'),
              created_by: currentUser?.id ?? null,
              created_by_name: currentUser ? displayName(currentUser) : null,
            })
            .select('*');
          if (error) throw error;

          const project = (created ?? [])[0] as WorkProject | undefined;
          if (project) {
            const { error: stepsError } = await supabase.from('work_project_steps').insert(
              WORK_STEPS_CANVAS[worksType].map((stepTitle, index) => ({
                project_id: project.id,
                step_order: index + 1,
                title: stepTitle,
                status: index === 0 ? 'en_cours' : 'en_attente',
              }))
            );
            if (stepsError) throw stepsError;
          }
        }
        await loadConnectedData();
      } else {
        let saved: WorkProject;
        let updated: WorkProject[];
        if (editing) {
          saved = { ...editing, ...payload } as WorkProject;
          updated = projects.map((project) => (project.id === saved.id ? saved : project));
        } else {
          saved = {
            id: crypto.randomUUID(),
            reference: buildReference('TRV'),
            created_by: currentUser?.id ?? null,
            created_by_name: currentUser ? displayName(currentUser) : null,
            created_at: now,
            steps: WORK_STEPS_CANVAS[worksType].map((stepTitle, index) => ({
              id: crypto.randomUUID(),
              project_id: '',
              step_order: index + 1,
              title: stepTitle,
              status: (index === 0 ? 'en_cours' : 'en_attente') as WorkStepStatus,
              created_at: now,
              updated_at: now,
            })),
            ...payload,
          } as WorkProject;
          saved.steps = (saved.steps ?? []).map((step) => ({ ...step, project_id: saved.id }));
          updated = [saved, ...projects];
        }
        setProjects(updated);
        setStoredData(STORAGE_KEYS.WORK_PROJECTS, updated);
        logAuditEvent({
          user_id: currentUser?.id || null,
          user_email: currentUser?.email || null,
          action: editing ? 'UPDATE' : 'CREATE',
          module: 'PROJECTS',
          entity_name: 'work_projects',
          entity_id: saved.id,
          old_values: editing ?? null,
          new_values: saved,
        });
      }

      setIsFormOpen(false);
      resetForm();
    } catch (error) {
      console.error('[Chantiers] Enregistrement impossible :', error);
      setDataError(error instanceof Error ? error.message : "L'enregistrement du chantier a échoué.");
    } finally {
      setIsSaving(false);
    }
  };

  const persistDemo = (
    updated: WorkProject[],
    entity: string,
    action: AuditLogEntry['action'],
    oldValue: AuditLogEntry['old_values'],
    newValue: AuditLogEntry['new_values'],
  ) => {
    setProjects(updated);
    setStoredData(STORAGE_KEYS.WORK_PROJECTS, updated);
    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action,
      module: 'PROJECTS',
      entity_name: entity,
      entity_id: newValue?.id ?? oldValue?.id ?? '',
      old_values: oldValue,
      new_values: newValue,
    });
  };

  const advanceStep = async (project: WorkProject, step: NonNullable<WorkProject['steps']>[number]) => {
    setDataError(null);
    const now = new Date().toISOString();
    const person = currentUser ? displayName(currentUser) : null;

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('work_project_steps')
          .update({
            status: 'termine',
            completed_at: now,
            completed_by: currentUser?.id ?? null,
            completed_by_name: person,
            updated_at: now,
          })
          .eq('id', step.id);
        if (error) throw error;

        const following = (project.steps ?? []).find((candidate) => candidate.step_order === step.step_order + 1);
        if (following && following.status === 'en_attente') {
          const { error: nextError } = await supabase
            .from('work_project_steps')
            .update({ status: 'en_cours', updated_at: now })
            .eq('id', following.id);
          if (nextError) throw nextError;
        }

        const fresh = await loadConnectedData();
        setDetailProject(fresh.find((candidate) => candidate.id === project.id) ?? null);
      } else {
        const updated = projects.map((candidate) =>
          candidate.id === project.id
            ? applyStepAdvance(candidate, step, currentUser?.id ?? null, person, now)
            : candidate
        );
        const reloaded = updated.find((candidate) => candidate.id === project.id);
        if (reloaded) {
          persistDemo(updated, 'work_project_steps', 'UPDATE', step, {
            ...step,
            status: 'termine',
            completed_at: now,
            completed_by: currentUser?.id ?? null,
            completed_by_name: person,
          });
          setDetailProject(reloaded);
        }
      }
    } catch (error) {
      console.error('[Chantiers] Avancement impossible :', error);
      setDataError(error instanceof Error ? error.message : "L'avancement de l'étape a échoué.");
    }
  };

  const advanceProject = async (project: WorkProject) => {
    const next = NEXT_PROJECT_STATUS[project.status];
    if (!next) return;
    setDataError(null);
    const now = new Date().toISOString();
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('work_projects')
          .update({ status: next, updated_at: now })
          .eq('id', project.id);
        if (error) throw error;
        await loadConnectedData();
      } else {
        const updated = projects.map((candidate) =>
          candidate.id === project.id ? { ...candidate, status: next, updated_at: now } : candidate
        );
        persistDemo(updated, 'work_projects', 'UPDATE', project, { ...project, status: next });
      }
    } catch (error) {
      console.error('[Chantiers] Changement de statut impossible :', error);
      setDataError(error instanceof Error ? error.message : "Le changement de statut a échoué.");
    }
  };

  const deleteProject = async (project: WorkProject) => {
    setDataError(null);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('work_projects').delete().eq('id', project.id);
        if (error) throw error;
        await loadConnectedData();
      } else {
        persistDemo(projects.filter((candidate) => candidate.id !== project.id), 'work_projects', 'DELETE', project, null);
      }
      if (detailProject?.id === project.id) setDetailProject(null);
    } catch (error) {
      console.error('[Chantiers] Suppression impossible :', error);
      setDataError(error instanceof Error ? error.message : 'La suppression du chantier a échoué.');
    }
  };

  const clientLabel = (value?: string | null) => {
    if (!value) return null;
    const client = clients.find((item) => item.id === value);
    if (!client) return null;
    return client.client_type === 'entreprise' ? client.company_name : `${client.first_name} ${client.last_name}`;
  };

  const plotLabel = (value?: string | null) => {
    if (!value) return null;
    const plot = plots.find((item) => item.id === value);
    if (!plot) return null;
    return `${plot.plot_number} · ${Number(plot.area_sqm).toLocaleString('fr-FR')} m²`;
  };

  const stepProgress = (project: WorkProject) => {
    const steps = project.steps ?? [];
    if (steps.length === 0) return 'Aucune étape';
    const done = steps.filter((step) => step.status === 'termine').length;
    return `${done}/${steps.length} étapes faites`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-executive-emerald" />
            Travaux, Aménagement &amp; Viabilisation
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            {projects.length} chantiers · {runningCount} en cours · {formatAmount(engagedTotal)} engagés
            {overdueCount > 0 ? ` · ${overdueCount} en retard` : ''}
            {pendingReceptionCount > 0 ? ` · ${pendingReceptionCount} réception(s) programmée(s)` : ''}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => openForm()} className="gap-2">
            <Plus className="w-4 h-4" /> Ouvrir un chantier
          </Button>
        )}
      </div>

      {!canManage && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            La consultation des chantiers vous est ouverte&nbsp;; l'ouverture et la planification des étapes sont
            réservées aux porteurs du droit « Gérer les chantiers ».
          </span>
        </div>
      )}

      {dataError && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{dataError}</span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3">
          <CardTitle>Chantiers suivis</CardTitle>
          <div className="flex flex-1 sm:justify-end flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Rechercher..."
                aria-label="Rechercher un chantier"
                className="pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-executive-darkBorder bg-white dark:bg-executive-darkBg"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | WorkProjectStatus)}
              className={selectClass}
              aria-label="Filtrer par statut"
            >
              <option value="all">Tous les statuts</option>
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {WORK_PROJECT_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'all' | WorkType)}
              className={selectClass}
              aria-label="Filtrer par nature de travaux"
            >
              <option value="all">Toutes les natures</option>
              {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((value) => (
                <option key={value} value={value}>
                  {WORK_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
            <button
              onClick={() => setOnlyMine((previous) => !previous)}
              className={`px-3 py-2 text-xs rounded-lg border ${
                onlyMine
                  ? 'bg-executive-emerald/10 border-executive-emerald text-executive-emerald font-semibold'
                  : 'border-slate-300 dark:border-executive-darkBorder text-slate-600 dark:text-slate-300'
              }`}
            >
              Mes chantiers
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-8 text-center text-xs text-slate-500">Chargement depuis Supabase...</p>
          ) : visibleProjects.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">Aucun chantier ne correspond à ces filtres.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
              {visibleProjects.map((project) => (
                <li key={project.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-slate-400">{project.reference}</span>
                      <Badge variant={PROJECT_BADGE[project.status]}>{WORK_PROJECT_STATUS_LABELS[project.status]}</Badge>
                      <Badge variant="neutral">{WORK_TYPE_LABELS[project.works_type]}</Badge>
                      {project.reception_status !== 'non_prevue' && (
                        <Badge variant={RECEPTION_BADGE[project.reception_status]}>
                          {RECEPTION_STATUS_LABELS[project.reception_status]}
                        </Badge>
                      )}
                      {isProjectOverdue(project) && (
                        <Badge variant="danger">
                          <Clock className="w-3 h-3 mr-1" /> En retard
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{project.title}</p>
                    <p className="text-xs text-slate-500 dark:text-executive-darkMuted flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {project.assigned_to_name || 'Non affecté'}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {project.site_location || 'Site non précisé'}
                      </span>
                      <span>{stepProgress(project)}</span>
                      <span>Fin visée {formatDate(project.target_end_date)}</span>
                      <span>Engagé {formatAmount(project.budget_engaged)}</span>
                      {clientLabel(project.client_id) && <span>Client : {clientLabel(project.client_id)}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetailProject(project)} className="gap-1.5">
                      <ClipboardCheck className="w-4 h-4" /> Suivre
                    </Button>
                    {canManage && NEXT_PROJECT_STATUS[project.status] && (
                      <Button variant="ghost" size="sm" onClick={() => advanceProject(project)} className="gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        {WORK_PROJECT_STATUS_LABELS[NEXT_PROJECT_STATUS[project.status] as WorkProjectStatus]}
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => openForm(project)}>
                        Modifier
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteProject(project)}
                        aria-label={`Supprimer ${project.reference}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? 'Modifier le chantier' : 'Ouvrir un chantier'}
        description={editing ? editing.reference : "Le canevas d'étapes sera généré selon la nature des travaux"}
        maxWidth="xl"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form="work-project-form" disabled={isSaving}>
              {isSaving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer et générer les étapes'}
            </Button>
          </div>
        }
      >
        <form id="work-project-form" onSubmit={handleSave} className="space-y-4">
          <Input
            label="Intitulé du chantier"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Viabilisation du lotissement La Grâce Japoma"
          />
          <div>
            <label className={fieldLabel}>Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={selectClass}
              placeholder="Périmètre, engins prévus, sous-traitance..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={fieldLabel}>Nature des travaux</label>
              <select value={worksType} onChange={(event) => setWorksType(event.target.value as WorkType)} className={selectClass}>
                {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((value) => (
                  <option key={value} value={value}>
                    {WORK_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Statut</label>
              <select value={status} onChange={(event) => setStatus(event.target.value as WorkProjectStatus)} className={selectClass}>
                {STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {WORK_PROJECT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Localisation du chantier"
              value={siteLocation}
              onChange={(event) => setSiteLocation(event.target.value)}
              placeholder="Japoma, Douala 3ème"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Budget prévisionnel (FCFA)"
              type="number"
              min="0"
              value={budgetEstimated}
              onChange={(event) => setBudgetEstimated(event.target.value)}
            />
            <Input
              label="Engagé (FCFA)"
              type="number"
              min="0"
              value={budgetEngaged}
              onChange={(event) => setBudgetEngaged(event.target.value)}
            />
            <Input
              label="Coût réel (FCFA)"
              type="number"
              min="0"
              value={costActual}
              onChange={(event) => setCostActual(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Début" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input
              label="Fin prévisionnelle"
              type="date"
              value={targetEndDate}
              onChange={(event) => setTargetEndDate(event.target.value)}
            />
            <Input
              label="Fin réelle"
              type="date"
              value={actualEndDate}
              onChange={(event) => setActualEndDate(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={fieldLabel}>Réception de travaux</label>
              <select
                value={receptionStatus}
                onChange={(event) => setReceptionStatus(event.target.value as ReceptionStatus)}
                className={selectClass}
              >
                {(Object.keys(RECEPTION_STATUS_LABELS) as ReceptionStatus[]).map((value) => (
                  <option key={value} value={value}>
                    {RECEPTION_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <Input label="Date de réception" type="date" value={receptionDate} onChange={(event) => setReceptionDate(event.target.value)} />
            <div>
              <label className={fieldLabel}>Chargé de chantier</label>
              <select value={assignee} onChange={(event) => setAssignee(event.target.value)} className={selectClass}>
                <option value="">Non affecté</option>
                {collaborators.map((user) => (
                  <option key={user.id} value={user.id}>
                    {displayName(user)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Client lié</label>
              <select value={clientId} onChange={(event) => setClientId(event.target.value)} className={selectClass}>
                <option value="">Aucun</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.client_type === 'entreprise' ? client.company_name : `${client.first_name} ${client.last_name}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Parcelle concernée</label>
              <select value={plotId} onChange={(event) => setPlotId(event.target.value)} className={selectClass}>
                <option value="">Aucune</option>
                {plots.map((plot) => (
                  <option key={plot.id} value={plot.id}>
                    {plot.plot_number} · {Number(plot.area_sqm).toLocaleString('fr-FR')} m²
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={fieldLabel}>Notes de chantier</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={selectClass}
              placeholder="Contraintes d'accès, météo, indisponibilité d'engin..."
            />
          </div>
          <div>
            <label className={fieldLabel}>Compte rendu de réception</label>
            <textarea
              rows={2}
              value={receptionNotes}
              onChange={(event) => setReceptionNotes(event.target.value)}
              className={selectClass}
              placeholder="Réserves levées, PV signé, intervenants..."
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(detailProject)}
        onClose={() => setDetailProject(null)}
        title={detailProject ? detailProject.title : ''}
        description={detailProject ? `${detailProject.reference} · ${stepProgress(detailProject)}` : undefined}
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <span className="text-xs text-slate-500 dark:text-executive-darkMuted">
              {detailProject ? `Engagé : ${formatAmount(detailProject.budget_engaged)}` : ''}
            </span>
            <Button variant="ghost" onClick={() => setDetailProject(null)}>
              Fermer
            </Button>
          </div>
        }
      >
        {detailProject && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-executive-darkSurface">
                <p className="text-slate-500 dark:text-executive-darkMuted">Parcelle</p>
                <p className="font-semibold">{plotLabel(detailProject.plot_id) ?? '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-executive-darkSurface">
                <p className="text-slate-500 dark:text-executive-darkMuted">Coût réel</p>
                <p className="font-semibold">{formatAmount(detailProject.cost_actual)}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-executive-darkSurface">
                <p className="text-slate-500 dark:text-executive-darkMuted">Réception</p>
                <p className="font-semibold">
                  {RECEPTION_STATUS_LABELS[detailProject.reception_status]} · {formatDate(detailProject.reception_date)}
                </p>
              </div>
            </div>

            {detailProject.reception_notes && (
              <p className="text-xs text-slate-600 dark:text-executive-darkMuted">{detailProject.reception_notes}</p>
            )}

            <ul className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
              {(detailProject.steps ?? []).map((step) => (
                <li key={step.id} className="py-3 flex items-center gap-3">
                  <span className="text-[11px] font-mono text-slate-400 w-6">{step.step_order}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{step.title}</p>
                    <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
                      {step.completed_by_name ? `Clôturée par ${step.completed_by_name}` : 'Non clôturée'} ·{' '}
                      {formatDate(step.completed_at)}
                    </p>
                  </div>
                  <Badge variant={STEP_BADGE[step.status]}>{WORK_STEP_STATUS_LABELS[step.status]}</Badge>
                  {canManage && step.status !== 'termine' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => advanceStep(detailProject, step)}
                      aria-label={`Clôturer l'étape ${step.step_order}`}
                      className="gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Faire
                    </Button>
                  )}
                </li>
              ))}
              {(detailProject.steps ?? []).length === 0 && (
                <li className="py-3 text-xs text-slate-500">
                  Aucune étape&nbsp;: le canevas n'a pas été généré pour ce chantier.
                </li>
              )}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
};
