export type WorkProjectStatus =
  | 'en_etude'
  | 'devis_valide'
  | 'en_cours'
  | 'suspendu'
  | 'termine'
  | 'annule';

export type WorkType = 'viabilisation' | 'terrassement' | 'assainissement' | 'cloture' | 'bornage' | 'amenagement';

export type ReceptionStatus = 'non_prevue' | 'programmee' | 'acceptee' | 'acceptee_avec_reserves' | 'refusee';

export type WorkStepStatus = 'en_attente' | 'en_cours' | 'termine' | 'signale';

export interface WorkProject {
  id: string;
  reference: string;
  title: string;
  description?: string | null;
  client_id?: string | null;
  plot_id?: string | null;
  site_location?: string | null;
  works_type: WorkType;
  status: WorkProjectStatus;
  budget_estimated?: number | null;
  budget_engaged?: number | null;
  cost_actual?: number | null;
  start_date?: string | null;
  target_end_date?: string | null;
  actual_end_date?: string | null;
  reception_status: ReceptionStatus;
  reception_date?: string | null;
  reception_notes?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  steps?: WorkProjectStep[];
}

export interface WorkProjectStep {
  id: string;
  project_id: string;
  step_order: number;
  title: string;
  status: WorkStepStatus;
  due_date?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export const WORK_PROJECT_STATUS_LABELS: Record<WorkProjectStatus, string> = {
  en_etude: 'En étude',
  devis_valide: 'Devis validé',
  en_cours: 'En cours',
  suspendu: 'Suspendu',
  termine: 'Terminé',
  annule: 'Annulé',
};

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  viabilisation: 'Viabilisation',
  terrassement: 'Terrassement',
  assainissement: 'Assainissement',
  cloture: 'Clôture',
  bornage: 'Bornage',
  amenagement: 'Aménagement',
};

export const RECEPTION_STATUS_LABELS: Record<ReceptionStatus, string> = {
  non_prevue: 'Réception non prévue',
  programmee: 'Réception programmée',
  acceptee: 'Réception acceptée',
  acceptee_avec_reserves: 'Acceptée avec réserves',
  refusee: 'Réception refusée',
};

export const WORK_STEP_STATUS_LABELS: Record<WorkStepStatus, string> = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  termine: 'Terminé',
  signale: 'Signalé',
};

// Le canevas dépend du type de travaux : c'est ce qui rend la planification réellement utile.
export const WORK_STEPS_CANVAS: Record<WorkType, string[]> = {
  viabilisation: [
    'Étude technique et implantation',
    'Ouverture de piste et terrassement',
    'Réseau d\'assainissement et buses',
    'Repérage des lots et bornage',
    'Réception de travaux et PV',
  ],
  terrassement: [
    'Relevé topographique et cubatures',
    'Décapage et mise à niveau',
    'Évacuation des excédents',
    'Contrôle de portance',
    'Réception de terrain',
  ],
  assainissement: [
    'Diagnostic du réseau existant',
    'Ouverture de tranchées',
    'Pose de buses et regards',
    'Essai de circulation et remblaiement',
    'Réception d\'ouvrage',
  ],
  cloture: [
    'Bornage contradictoire des limites',
    'Implantation et piquetage',
    'Fondations et poteaux',
    'Maçonnerie ou grillage',
    'Réception de clôture',
  ],
  bornage: [
    'Constitution du dossier foncier',
    'Convocation des riverains',
    'Opération de terrain du géomètre',
    'Procès-verbal de bornage',
    'Dépôt au Cadastre',
  ],
  amenagement: [
    'Plan d\'aménagement et devis',
    'Approvisionnement matériaux',
    'Travaux de voirie et drainage',
    'Équipements et signalétique',
    'Réception et mise en service',
  ],
};

export const isProjectOverdue = (project: WorkProject): boolean => {
  if (!project.target_end_date) return false;
  if (project.status === 'termine' || project.status === 'annule') return false;
  return new Date(`${project.target_end_date}T23:59:59`).getTime() < Date.now();
};
