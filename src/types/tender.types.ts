export type TenderStatus =
  | 'veille'
  | 'candidature'
  | 'soumission'
  | 'adjudique'
  | 'sans_suite'
  | 'abandonne'
  | 'en_execution'
  | 'cloture';

export type TenderMethod = 'appel_offres' | 'consultation' | 'sous_entente' | 'gre_a_gre';

export type TenderDocStatus = 'a_obtenir' | 'en_cours' | 'obtenu' | 'valide' | 'rejete';

export type TenderDocCategory = 'administratif' | 'technique' | 'financier';

export type ServiceOrderType = 'ordre_service' | 'avenant' | 'decompte';

export type ServiceOrderStatus = 'emis' | 'notifie' | 'facture' | 'paye' | 'refuse';

export interface Tender {
  id: string;
  reference: string;
  title: string;
  contracting_authority?: string | null;
  source?: string | null;
  tender_method: TenderMethod;
  status: TenderStatus;
  estimated_amount?: number | null;
  caution_amount?: number | null;
  bid_amount?: number | null;
  contract_number?: string | null;
  awarded_at?: string | null;
  contract_signed_at?: string | null;
  advance_payment_rate?: number | null;
  publication_date?: string | null;
  deadline?: string | null;
  execution_delay_days?: number | null;
  site_location?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  documents?: TenderDocument[];
  service_orders?: TenderServiceOrder[];
}

export interface TenderDocument {
  id: string;
  tender_id: string;
  title: string;
  category: TenderDocCategory;
  status: TenderDocStatus;
  obtained_at?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenderServiceOrder {
  id: string;
  tender_id: string;
  reference: string;
  order_type: ServiceOrderType;
  title: string;
  issued_on?: string | null;
  amount?: number | null;
  status: ServiceOrderStatus;
  notes?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  veille: 'En veille',
  candidature: 'Candidature',
  soumission: 'Soumission remise',
  adjudique: 'Adjugé',
  sans_suite: 'Sans suite',
  abandonne: 'Abandonné',
  en_execution: 'En exécution',
  cloture: 'Clôturé',
};

export const TENDER_METHOD_LABELS: Record<TenderMethod, string> = {
  appel_offres: "Appel d'offres",
  consultation: 'Consultation',
  sous_entente: 'Sous entente',
  gre_a_gre: 'Gré à gré',
};

export const TENDER_DOC_STATUS_LABELS: Record<TenderDocStatus, string> = {
  a_obtenir: 'A obtenir',
  en_cours: 'En cours d\'obtention',
  obtenu: 'Obtenue',
  valide: 'Validée',
  rejete: 'Rejetée',
};

export const TENDER_DOC_CATEGORY_LABELS: Record<TenderDocCategory, string> = {
  administratif: 'Administratif',
  technique: 'Technique',
  financier: 'Financier',
};

export const SERVICE_ORDER_TYPE_LABELS: Record<ServiceOrderType, string> = {
  ordre_service: 'Ordre de service',
  avenant: 'Avenant',
  decompte: 'Décompte',
};

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  emis: 'Émis',
  notifie: 'Notifié',
  facture: 'Facturé',
  paye: 'Payé',
  refuse: 'Refusé',
};

// Le dossier d'un marché public camerounais ne change pas selon la méthode de passation :
// ce sont les mêmes pièces, seulement complétées selon l'avis d'appel à la concurrence.
export const TENDER_DOCS_CANVAS: Array<{ title: string; category: TenderDocCategory }> = [
  { title: 'Registre de commerce', category: 'administratif' },
  { title: 'Certificat de non-imposition', category: 'administratif' },
  { title: 'Attestation de la CNPS', category: 'administratif' },
  { title: 'Certificat de solvabilité bancaire', category: 'financier' },
  { title: 'Caution de soumission', category: 'financier' },
  { title: 'Mémoire technique et méthodologie', category: 'technique' },
  { title: 'Planning d\'exécution', category: 'technique' },
];

export const NEXT_TENDER_STATUS: Partial<Record<TenderStatus, TenderStatus>> = {
  veille: 'candidature',
  candidature: 'soumission',
  soumission: 'adjudique',
  adjudique: 'en_execution',
  en_execution: 'cloture',
};

export const DOC_NEXT_STATUS: Partial<Record<TenderDocStatus, TenderDocStatus>> = {
  a_obtenir: 'en_cours',
  en_cours: 'obtenu',
  obtenu: 'valide',
};

export const NEXT_SERVICE_ORDER_STATUS: Partial<Record<ServiceOrderStatus, ServiceOrderStatus>> = {
  emis: 'notifie',
  notifie: 'facture',
  facture: 'paye',
};

export const deadlineWithinDays = (tender: Tender, days: number): boolean => {
  if (!tender.deadline) return false;
  if (tender.status === 'cloture' || tender.status === 'abandonne' || tender.status === 'sans_suite') return false;
  const limit = new Date(`${tender.deadline}T23:59:59`).getTime();
  return limit >= Date.now() && limit <= Date.now() + days * 86400000;
};

export const isTenderOverdue = (tender: Tender): boolean => {
  if (!tender.deadline) return false;
  if (tender.status === 'cloture' || tender.status === 'abandonne' || tender.status === 'sans_suite') return false;
  if (tender.status !== 'veille' && tender.status !== 'candidature' && tender.status !== 'soumission') return false;
  return new Date(`${tender.deadline}T23:59:59`).getTime() < Date.now();
};
