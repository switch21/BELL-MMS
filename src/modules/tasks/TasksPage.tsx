import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
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
import { UserProfile } from '../../types/auth.types';
import { Client } from '../../types/land.types';
import {
  AGENDA_EVENT_STATUS_LABELS,
  AGENDA_EVENT_TYPE_LABELS,
  AgendaEvent,
  AgendaEventStatus,
  AgendaEventType,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from '../../types/task.types';
import {
  getStoredData,
  INITIAL_AGENDA_EVENTS,
  INITIAL_CLIENTS,
  INITIAL_TASKS,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const REFERENCE_YEAR = new Date().getFullYear();

const buildReference = (prefix: string) =>
  `${prefix}-${REFERENCE_YEAR}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const toLocalInputValue = (iso?: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const fromLocalInputValue = (value: string): string => new Date(value).toISOString();

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
};

const formatSlot = (event: AgendaEvent): string => {
  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) return formatDate(event.starts_at);
  const time = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${start.toLocaleDateString('fr-FR')} · ${time}`;
};

const isOverdue = (task: TaskItem): boolean => {
  if (!task.due_date) return false;
  if (task.status === 'termine' || task.status === 'annule') return false;
  const due = new Date(`${task.due_date}T23:59:59`);
  return due.getTime() < Date.now();
};

const STATUS_ORDER: TaskStatus[] = ['a_faire', 'en_cours', 'en_attente', 'bloque', 'termine', 'annule'];
const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  a_faire: 'en_cours',
  en_cours: 'termine',
  en_attente: 'en_cours',
  bloque: 'en_cours',
};

type BadgeVariant = 'emerald' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TASK_BADGE: Record<TaskStatus, BadgeVariant> = {
  a_faire: 'neutral',
  en_cours: 'info',
  en_attente: 'warning',
  bloque: 'danger',
  termine: 'emerald',
  annule: 'neutral',
};

const PRIORITY_BADGE: Record<TaskPriority, BadgeVariant> = {
  basse: 'neutral',
  normale: 'info',
  haute: 'warning',
  urgente: 'danger',
};

const AGENDA_BADGE: Record<AgendaEventStatus, BadgeVariant> = {
  planifie: 'info',
  confirme: 'emerald',
  realise: 'neutral',
  annule: 'danger',
};

const selectClass =
  'w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs';

export const TasksPage: React.FC = () => {
  const { currentUser, hasPermission, hasRole, usersList } = useAuth();

  const [activeTab, setActiveTab] = useState<'tasks' | 'agenda'>('tasks');
  const [tasks, setTasks] = useState<TaskItem[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<TaskItem[]>(STORAGE_KEYS.TASKS, INITIAL_TASKS)
  );
  const [events, setEvents] = useState<AgendaEvent[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<AgendaEvent[]>(STORAGE_KEYS.AGENDA_EVENTS, INITIAL_AGENDA_EVENTS)
  );
  const [clients, setClients] = useState<Client[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Client[]>(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS)
  );
  const [collaborators, setCollaborators] = useState<UserProfile[]>(() =>
    isSupabaseConfigured ? [] : usersList
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [onlyMine, setOnlyMine] = useState(false);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('a_faire');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('normale');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskClient, setTaskClient] = useState('');
  const [taskNotes, setTaskNotes] = useState('');

  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<AgendaEventType>('visite_terrain');
  const [eventStatus, setEventStatus] = useState<AgendaEventStatus>('planifie');
  const [eventLocation, setEventLocation] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventAssignee, setEventAssignee] = useState('');
  const [eventClient, setEventClient] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  const canManageTasks = hasPermission('tasks:manage');
  const canManageAgenda = hasPermission('agenda:manage');
  const canDelete = hasRole(['directeur_general', 'super_admin']);

  const displayName = (user?: UserProfile | null) =>
    user ? `${user.first_name} ${user.last_name}`.trim() : 'Non affecté';

  const loadConnectedData = async () => {
    const [tasksResult, eventsResult, clientsResult, profilesResult] = await Promise.all([
      supabase.from('tasks').select('*').order('due_date', { ascending: true }),
      supabase.from('agenda_events').select('*').order('starts_at', { ascending: true }),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('last_name'),
    ]);

    if (tasksResult.error) throw tasksResult.error;
    if (eventsResult.error) throw eventsResult.error;
    if (clientsResult.error) throw clientsResult.error;
    if (profilesResult.error) throw profilesResult.error;

    setTasks((tasksResult.data ?? []) as TaskItem[]);
    setEvents((eventsResult.data ?? []) as AgendaEvent[]);
    setClients((clientsResult.data ?? []) as Client[]);
    setCollaborators((profilesResult.data ?? []) as UserProfile[]);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    setIsLoading(true);
    loadConnectedData()
      .catch((error: unknown) => {
        console.error('[Supabase] Impossible de charger les tâches et l agenda :', error);
        if (active) {
          setDataError('Impossible de charger les tâches et l agenda depuis Supabase. Vérifiez la connexion, les migrations et vos droits.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleTasks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (onlyMine && task.assigned_to !== currentUser?.id) return false;
      if (!term) return true;
      return (
        task.title.toLowerCase().includes(term) ||
        (task.reference ?? '').toLowerCase().includes(term) ||
        (task.assigned_to_name ?? '').toLowerCase().includes(term)
      );
    });
  }, [tasks, statusFilter, onlyMine, searchTerm, currentUser?.id]);

  const visibleEvents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return events.filter((event) => {
      if (!term) return true;
      return (
        event.title.toLowerCase().includes(term) ||
        (event.location ?? '').toLowerCase().includes(term) ||
        (event.assigned_to_name ?? '').toLowerCase().includes(term)
      );
    });
  }, [events, searchTerm]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return visibleEvents.filter((event) => new Date(event.starts_at).getTime() >= now && event.status !== 'annule');
  }, [visibleEvents]);

  const overdueCount = useMemo(() => tasks.filter(isOverdue).length, [tasks]);
  const openCount = useMemo(
    () => tasks.filter((task) => task.status !== 'termine' && task.status !== 'annule').length,
    [tasks]
  );

  const resetTaskForm = () => {
    setEditingTask(null);
    setTaskTitle('');
    setTaskDescription('');
    setTaskStatus('a_faire');
    setTaskPriority('normale');
    setTaskDueDate('');
    setTaskAssignee(currentUser?.id ?? '');
    setTaskClient('');
    setTaskNotes('');
  };

  const openTaskModal = (task?: TaskItem) => {
    setDataError(null);
    if (task) {
      setEditingTask(task);
      setTaskTitle(task.title);
      setTaskDescription(task.description ?? '');
      setTaskStatus(task.status);
      setTaskPriority(task.priority);
      setTaskDueDate(task.due_date ?? '');
      setTaskAssignee(task.assigned_to ?? '');
      setTaskClient(task.client_id ?? '');
      setTaskNotes(task.notes ?? '');
    } else {
      resetTaskForm();
    }
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setDataError(null);

    const assignee = collaborators.find((user) => user.id === taskAssignee) || null;
    const now = new Date().toISOString();
    const payload = {
      title: taskTitle,
      description: taskDescription || null,
      status: taskStatus,
      priority: taskPriority,
      due_date: taskDueDate || null,
      assigned_to: taskAssignee || null,
      assigned_to_name: assignee ? displayName(assignee) : null,
      client_id: taskClient || null,
      notes: taskNotes || null,
      completed_at: taskStatus === 'termine' ? (editingTask?.completed_at ?? now) : null,
      updated_at: now,
    };

    try {
      if (isSupabaseConfigured) {
        if (editingTask) {
          const { error } = await supabase.from('tasks').update(payload).eq('id', editingTask.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('tasks')
            .insert({
              ...payload,
              reference: buildReference('TSK'),
              created_by: currentUser?.id ?? null,
              created_by_name: currentUser ? displayName(currentUser) : null,
            });
          if (error) throw error;
        }
        await loadConnectedData();
      } else {
        let saved: TaskItem;
        let updated: TaskItem[];
        if (editingTask) {
          saved = { ...editingTask, ...payload };
          updated = tasks.map((task) => (task.id === saved.id ? saved : task));
        } else {
          saved = {
            id: crypto.randomUUID(),
            reference: buildReference('TSK'),
            created_by: currentUser?.id ?? null,
            created_by_name: currentUser ? displayName(currentUser) : null,
            created_at: now,
            ...payload,
          } as TaskItem;
          updated = [saved, ...tasks];
        }
        setTasks(updated);
        setStoredData(STORAGE_KEYS.TASKS, updated);
        logAuditEvent({
          user_id: currentUser?.id || null,
          user_email: currentUser?.email || null,
          action: editingTask ? 'UPDATE' : 'CREATE',
          module: 'TASKS',
          entity_name: 'tasks',
          entity_id: saved.id,
          old_values: editingTask ?? null,
          new_values: saved,
        });
      }

      setIsTaskModalOpen(false);
      resetTaskForm();
    } catch (error) {
      console.error('[Tâches] Enregistrement impossible :', error);
      setDataError(error instanceof Error ? error.message : 'L enregistrement de la tâche a échoué.');
    } finally {
      setIsSaving(false);
    }
  };

  const advanceTask = async (task: TaskItem) => {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    await persistTaskStatus(task, next);
  };

  const persistTaskStatus = async (task: TaskItem, status: TaskStatus) => {
    setDataError(null);
    const now = new Date().toISOString();
    const payload = {
      status,
      completed_at: status === 'termine' ? now : null,
      updated_at: now,
    };

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', task.id);
        if (error) throw error;
        setTasks((previous) => previous.map((item) => (item.id === task.id ? { ...item, ...payload } : item)));
      } else {
        const updated = tasks.map((item) => (item.id === task.id ? { ...item, ...payload } : item));
        setTasks(updated);
        setStoredData(STORAGE_KEYS.TASKS, updated);
        logAuditEvent({
          user_id: currentUser?.id || null,
          user_email: currentUser?.email || null,
          action: 'UPDATE',
          module: 'TASKS',
          entity_name: 'tasks',
          entity_id: task.id,
          old_values: task,
          new_values: { ...task, ...payload },
        });
      }
    } catch (error) {
      console.error('[Tâches] Changement de statut impossible :', error);
      setDataError(error instanceof Error ? error.message : 'Le changement de statut a échoué.');
    }
  };

  const deleteTask = async (task: TaskItem) => {
    setDataError(null);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tasks').delete().eq('id', task.id);
        if (error) throw error;
        setTasks((previous) => previous.filter((item) => item.id !== task.id));
      } else {
        const updated = tasks.filter((item) => item.id !== task.id);
        setTasks(updated);
        setStoredData(STORAGE_KEYS.TASKS, updated);
        logAuditEvent({
          user_id: currentUser?.id || null,
          user_email: currentUser?.email || null,
          action: 'DELETE',
          module: 'TASKS',
          entity_name: 'tasks',
          entity_id: task.id,
          old_values: task,
          new_values: null,
        });
      }
    } catch (error) {
      console.error('[Tâches] Suppression impossible :', error);
      setDataError(error instanceof Error ? error.message : 'La suppression de la tâche a échoué.');
    }
  };

  const resetEventForm = () => {
    setEditingEvent(null);
    setEventTitle('');
    setEventType('visite_terrain');
    setEventStatus('planifie');
    setEventLocation('');
    setEventStart('');
    setEventEnd('');
    setEventAssignee(currentUser?.id ?? '');
    setEventClient('');
    setEventNotes('');
  };

  const openEventModal = (event?: AgendaEvent) => {
    setDataError(null);
    if (event) {
      setEditingEvent(event);
      setEventTitle(event.title);
      setEventType(event.event_type);
      setEventStatus(event.status);
      setEventLocation(event.location ?? '');
      setEventStart(toLocalInputValue(event.starts_at));
      setEventEnd(toLocalInputValue(event.ends_at));
      setEventAssignee(event.assigned_to ?? '');
      setEventClient(event.client_id ?? '');
      setEventNotes(event.notes ?? '');
    } else {
      resetEventForm();
    }
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (eventEnd && eventStart && new Date(eventEnd).getTime() < new Date(eventStart).getTime()) {
      setDataError('La fin du créneau ne peut pas précéder son début.');
      return;
    }

    setIsSaving(true);
    setDataError(null);

    const assignee = collaborators.find((user) => user.id === eventAssignee) || null;
    const now = new Date().toISOString();
    const payload = {
      title: eventTitle,
      description: null,
      event_type: eventType,
      status: eventStatus,
      location: eventLocation || null,
      starts_at: fromLocalInputValue(eventStart),
      ends_at: eventEnd ? fromLocalInputValue(eventEnd) : null,
      assigned_to: eventAssignee || null,
      assigned_to_name: assignee ? displayName(assignee) : null,
      client_id: eventClient || null,
      notes: eventNotes || null,
      updated_at: now,
    };

    try {
      if (isSupabaseConfigured) {
        if (editingEvent) {
          const { error } = await supabase.from('agenda_events').update(payload).eq('id', editingEvent.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('agenda_events')
            .insert({
              ...payload,
              reference: buildReference('AGR'),
              created_by: currentUser?.id ?? null,
              created_by_name: currentUser ? displayName(currentUser) : null,
            });
          if (error) throw error;
        }
        await loadConnectedData();
      } else {
        let saved: AgendaEvent;
        if (editingEvent) {
          saved = { ...editingEvent, ...payload };
          const updated = events.map((item) => (item.id === saved.id ? saved : item));
          setEvents(updated);
          setStoredData(STORAGE_KEYS.AGENDA_EVENTS, updated);
        } else {
          saved = {
            id: crypto.randomUUID(),
            reference: buildReference('AGR'),
            created_by: currentUser?.id ?? null,
            created_by_name: currentUser ? displayName(currentUser) : null,
            created_at: now,
            ...payload,
          } as AgendaEvent;
          const updated = [saved, ...events];
          setEvents(updated);
          setStoredData(STORAGE_KEYS.AGENDA_EVENTS, updated);
        }
        logAuditEvent({
          user_id: currentUser?.id || null,
          user_email: currentUser?.email || null,
          action: editingEvent ? 'UPDATE' : 'CREATE',
          module: 'AGENDA',
          entity_name: 'agenda_events',
          entity_id: saved.id,
          old_values: editingEvent ?? null,
          new_values: saved,
        });
      }

      setIsEventModalOpen(false);
      resetEventForm();
    } catch (error) {
      console.error('[Agenda] Enregistrement impossible :', error);
      setDataError(error instanceof Error ? error.message : "L enregistrement de l'événement a échoué.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteEvent = async (event: AgendaEvent) => {
    setDataError(null);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('agenda_events').delete().eq('id', event.id);
        if (error) throw error;
        setEvents((previous) => previous.filter((item) => item.id !== event.id));
      } else {
        const updated = events.filter((item) => item.id !== event.id);
        setEvents(updated);
        setStoredData(STORAGE_KEYS.AGENDA_EVENTS, updated);
        logAuditEvent({
          user_id: currentUser?.id || null,
          user_email: currentUser?.email || null,
          action: 'DELETE',
          module: 'AGENDA',
          entity_name: 'agenda_events',
          entity_id: event.id,
          old_values: event,
          new_values: null,
        });
      }
    } catch (error) {
      console.error('[Agenda] Suppression impossible :', error);
      setDataError(error instanceof Error ? error.message : 'La suppression de l événement a échoué.');
    }
  };

  const clientLabel = (clientId?: string | null) => {
    if (!clientId) return null;
    const client = clients.find((item) => item.id === clientId);
    if (!client) return null;
    return client.client_type === 'entreprise' ? client.company_name : `${client.first_name} ${client.last_name}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-executive-emerald" />
            Agenda, Tâches &amp; Suivi des Collaborateurs
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            {openCount} tâches ouvertes · {upcomingEvents.length} événements à venir
            {overdueCount > 0 ? ` · ${overdueCount} en retard` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'tasks' ? (
            canManageTasks && (
              <Button onClick={() => openTaskModal()} className="gap-2">
                <Plus className="w-4 h-4" /> Nouvelle tâche
              </Button>
            )
          ) : (
            canManageAgenda && (
              <Button onClick={() => openEventModal()} className="gap-2">
                <Plus className="w-4 h-4" /> Nouvel événement
              </Button>
            )
          )}
        </div>
      </div>

      {dataError && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{dataError}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'tasks'
              ? 'bg-executive-emerald text-white'
              : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-executive-darkBorder'
          }`}
        >
          Tâches ({tasks.length})
        </button>
        <button
          onClick={() => setActiveTab('agenda')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'agenda'
              ? 'bg-executive-emerald text-white'
              : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-executive-darkBorder'
          }`}
        >
          Agenda ({events.length})
        </button>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3">
          <CardTitle>{activeTab === 'tasks' ? 'Suivi des tâches' : 'Agenda partagé'}</CardTitle>
          <div className="flex flex-1 sm:justify-end flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher..."
                className="pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-executive-darkBorder bg-white dark:bg-executive-darkBg"
              />
            </div>
            {activeTab === 'tasks' && (
              <>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | TaskStatus)}
                  className={selectClass}
                  aria-label="Filtrer par statut"
                >
                  <option value="all">Tous les statuts</option>
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {TASK_STATUS_LABELS[status]}
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
                  Mes tâches
                </button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-8 text-center text-xs text-slate-500">Chargement depuis Supabase...</p>
          ) : activeTab === 'tasks' ? (
            visibleTasks.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">Aucune tâche ne correspond à ces filtres.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                {visibleTasks.map((task) => (
                  <li key={task.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-slate-400">{task.reference}</span>
                        <Badge variant={TASK_BADGE[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
                        <Badge variant={PRIORITY_BADGE[task.priority]}>
                          {TASK_PRIORITY_LABELS[task.priority]}
                        </Badge>
                        {isOverdue(task) && (
                          <Badge variant="danger">
                            <Clock className="w-3 h-3 mr-1" /> En retard
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{task.title}</p>
                      <p className="text-xs text-slate-500 dark:text-executive-darkMuted flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {task.assigned_to_name || 'Non affecté'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Échéance {formatDate(task.due_date)}
                        </span>
                        {clientLabel(task.client_id) && <span>Client : {clientLabel(task.client_id)}</span>}
                      </p>
                    </div>
                    {canManageTasks && (
                      <div className="flex items-center gap-2">
                        {NEXT_STATUS[task.status] && (
                          <Button variant="outline" size="sm" onClick={() => advanceTask(task)} className="gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            {TASK_STATUS_LABELS[NEXT_STATUS[task.status] as TaskStatus]}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => openTaskModal(task)}>
                          Modifier
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="sm" onClick={() => deleteTask(task)} aria-label={`Supprimer ${task.reference}`}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : visibleEvents.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">Aucun événement dans l agenda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
              {visibleEvents.map((event) => (
                <li key={event.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-slate-400">{event.reference}</span>
                      <Badge variant={AGENDA_BADGE[event.status]}>{AGENDA_EVENT_STATUS_LABELS[event.status]}</Badge>
                      <Badge variant="neutral">{AGENDA_EVENT_TYPE_LABELS[event.event_type]}</Badge>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{event.title}</p>
                    <p className="text-xs text-slate-500 dark:text-executive-darkMuted flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatSlot(event)}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {event.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {event.assigned_to_name || 'Non affecté'}
                      </span>
                      {clientLabel(event.client_id) && <span>Client : {clientLabel(event.client_id)}</span>}
                    </p>
                  </div>
                  {canManageAgenda && (
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEventModal(event)}>
                        Modifier
                      </Button>
                      {canDelete && (
                        <Button variant="ghost" size="sm" onClick={() => deleteEvent(event)} aria-label={`Supprimer ${event.reference}`}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {!canManageTasks && !canManageAgenda && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <ChevronRight className="w-3 h-3" /> Votre rôle consulte l agenda et les tâches ; la saisie est réservée aux
          habilités.
        </p>
      )}

      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title={editingTask ? 'Modifier la tâche' : 'Nouvelle tâche'}
        description={editingTask ? editingTask.reference : 'Affectation, priorité et échéance'}
        maxWidth="lg"
      >
        <form id="task-form" onSubmit={handleSaveTask} className="space-y-4">
          <Input
            label="Intitulé"
            required
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Déposer le dossier de bornage au Cadastre"
          />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              className={selectClass}
              placeholder="Contexte, livrable attendu, interlocuteur..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Statut
              </label>
              <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as TaskStatus)} className={selectClass}>
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Priorité
              </label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className={selectClass}
              >
                {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
            <Input label="Échéance" type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Collaborateur
              </label>
              <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className={selectClass}>
                <option value="">Non affecté</option>
                {collaborators.map((user) => (
                  <option key={user.id} value={user.id}>
                    {displayName(user)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Client lié
              </label>
              <select value={taskClient} onChange={(e) => setTaskClient(e.target.value)} className={selectClass}>
                <option value="">Aucun</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.client_type === 'entreprise' ? client.company_name : `${client.first_name} ${client.last_name}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Notes
            </label>
            <textarea
              rows={2}
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              className={selectClass}
              placeholder="Points de vigilance, documents à joindre..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsTaskModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? 'Enregistrement...' : 'Enregistrer la tâche'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        title={editingEvent ? "Modifier l'événement" : 'Nouvel événement'}
        description={editingEvent ? editingEvent.reference : 'Visite, rendez-vous notarial, réception de travaux'}
        maxWidth="lg"
      >
        <form id="event-form" onSubmit={handleSaveEvent} className="space-y-4">
          <Input
            label="Intitulé"
            required
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            placeholder="Visite de terrain — Japoma"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Type
              </label>
              <select value={eventType} onChange={(e) => setEventType(e.target.value as AgendaEventType)} className={selectClass}>
                {(Object.keys(AGENDA_EVENT_TYPE_LABELS) as AgendaEventType[]).map((type) => (
                  <option key={type} value={type}>
                    {AGENDA_EVENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Statut
              </label>
              <select
                value={eventStatus}
                onChange={(e) => setEventStatus(e.target.value as AgendaEventStatus)}
                className={selectClass}
              >
                {(Object.keys(AGENDA_EVENT_STATUS_LABELS) as AgendaEventStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {AGENDA_EVENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Début"
              type="datetime-local"
              required
              value={eventStart}
              onChange={(e) => setEventStart(e.target.value)}
            />
            <Input label="Fin" type="datetime-local" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
          </div>
          <Input
            label="Lieu"
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
            placeholder="Japoma, Douala 3ème"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Responsable
              </label>
              <select value={eventAssignee} onChange={(e) => setEventAssignee(e.target.value)} className={selectClass}>
                <option value="">Non affecté</option>
                {collaborators.map((user) => (
                  <option key={user.id} value={user.id}>
                    {displayName(user)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Client lié
              </label>
              <select value={eventClient} onChange={(e) => setEventClient(e.target.value)} className={selectClass}>
                <option value="">Aucun</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.client_type === 'entreprise' ? client.company_name : `${client.first_name} ${client.last_name}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Notes
            </label>
            <textarea
              rows={2}
              value={eventNotes}
              onChange={(e) => setEventNotes(e.target.value)}
              className={selectClass}
              placeholder="Pièces à préparer, personne à prévenir sur place..."
            />
          </div>
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" /> Les rappels automatiques restent hors périmètre : aucun planificateur
            n est déployé côté serveur.
          </p>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEventModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? 'Enregistrement...' : 'Enregistrer l événement'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
