export type TaskStatus = 'a_faire' | 'en_cours' | 'en_attente' | 'bloque' | 'termine' | 'annule';
export type TaskPriority = 'basse' | 'normale' | 'haute' | 'urgente';

export interface TaskItem {
  id: string;
  reference: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  client_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type AgendaEventType =
  | 'visite_terrain'
  | 'rdv_notaire'
  | 'rdv_client'
  | 'reception_travaux'
  | 'relance_paiement'
  | 'autre';
export type AgendaEventStatus = 'planifie' | 'confirme' | 'realise' | 'annule';

export interface AgendaEvent {
  id: string;
  reference: string;
  title: string;
  description?: string | null;
  event_type: AgendaEventType;
  status: AgendaEventStatus;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  client_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  en_attente: 'En attente',
  bloque: 'Bloquée',
  termine: 'Terminée',
  annule: 'Annulée',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
  urgente: 'Urgente',
};

export const AGENDA_EVENT_TYPE_LABELS: Record<AgendaEventType, string> = {
  visite_terrain: 'Visite de terrain',
  rdv_notaire: 'Rendez-vous notarial',
  rdv_client: 'Rendez-vous client',
  reception_travaux: 'Réception de travaux',
  relance_paiement: 'Relance de paiement',
  autre: 'Autre',
};

export const AGENDA_EVENT_STATUS_LABELS: Record<AgendaEventStatus, string> = {
  planifie: 'Planifié',
  confirme: 'Confirmé',
  realise: 'Réalisé',
  annule: 'Annulé',
};
