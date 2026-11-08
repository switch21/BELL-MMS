import { Client } from './land.types';

export type ServiceCaseStatus =
  | 'creation'
  | 'pieces_en_cours'
  | 'instruction_cadastre'
  | 'soumis_validation_dg'
  | 'approuve_dg'
  | 'rejete_dg'
  | 'cloture';

export type DGValidationStatus = 'non_soumis' | 'en_attente' | 'approuve' | 'rejete';

export interface ServiceType {
  id: string;
  code: string;
  name: string;
  description: string;
  standard_fee: number;
  estimated_duration_days: number;
  required_documents: string[];
  is_active: boolean;
}

export interface ServiceCaseStep {
  id: string;
  case_id: string;
  step_order: number;
  title: string;
  description?: string;
  status: 'en_attente' | 'en_cours' | 'termine' | 'bloque';
  completed_by_name?: string;
  completed_at?: string;
  notes?: string;
}

export interface ServiceCase {
  id: string;
  reference: string;
  client_id: string;
  client?: Client;
  service_type_id: string;
  service_type?: ServiceType;
  title: string;
  description?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  opened_date: string;
  target_date?: string;
  closing_date?: string;
  status: ServiceCaseStatus;
  fee_agreed: number;
  expenses_estimated: number;
  expenses_actual: number;
  amount_paid: number;
  dg_validation_status: DGValidationStatus;
  dg_validated_by_name?: string;
  dg_validation_date?: string;
  dg_notes?: string;
  steps: ServiceCaseStep[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type FinancingCaseStatus =
  | 'prospect'
  | 'etude'
  | 'en_constitution'
  | 'soumis_banque'
  | 'en_attente'
  | 'complement_demande'
  | 'accepte'
  | 'refuse'
  | 'financement_obtenu'
  | 'cloture';

export interface FinancingCase {
  id: string;
  reference: string;
  client_id: string;
  client?: Client;
  partner_bank_name: string;
  purpose: string;
  amount_requested: number;
  amount_approved: number;
  duration_months: number;
  proposed_collateral: string;
  status: FinancingCaseStatus;
  assigned_to_name?: string;
  commission_rate: number;
  commission_amount: number;
  decision_date?: string;
  decision_notes?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}
