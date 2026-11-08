import { Client, Plot } from './land.types';

export type ReservationStatus =
  | 'active'
  | 'confirmee'
  | 'expiree'
  | 'annulee'
  | 'transformee_en_vente';

export type SaleType = 'comptant' | 'echelonne';

export type PaymentMethod = 'virement' | 'cheque' | 'versement_bancaire' | 'especes';

export type SaleStatus = 'en_cours' | 'soldee' | 'annulee';

export type ScheduleStatus = 'en_attente' | 'partiel' | 'paye' | 'en_retard';

export interface Reservation {
  id: string;
  reference: string;
  client_id: string;
  client?: Client;
  plot_id: string;
  plot?: Plot;
  agreed_price: number;
  deposit_amount: number;
  reservation_date: string;
  duration_days: number;
  expiration_date: string;
  status: ReservationStatus;
  sales_rep_name?: string;
  conditions?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentSchedule {
  id: string;
  sale_id: string;
  installment_number: number;
  due_date: string;
  due_amount: number;
  paid_amount: number;
  status: ScheduleStatus;
  paid_at?: string;
  receipt_reference?: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  reference: string;
  sale_id: string;
  schedule_id?: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  transaction_ref?: string;
  received_by_name?: string;
  notes?: string;
  created_at: string;
}

export interface Sale {
  id: string;
  reference: string;
  client_id: string;
  client?: Client;
  plot_id: string;
  plot?: Plot;
  reservation_id?: string;
  sale_type: SaleType;
  sale_date: string;
  total_price: number;
  discount_amount: number;
  final_price: number;
  initial_deposit: number;
  remaining_balance: number;
  payment_method: PaymentMethod;
  status: SaleStatus;
  sales_rep_name?: string;
  validated_by_name?: string;
  validated_at?: string;
  schedules?: PaymentSchedule[];
  receipts?: Receipt[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ThirdPartySettlement {
  id: string;
  reference: string;
  partner_id: string;
  partner_name: string;
  sale_id: string;
  sale_reference: string;
  plot_number: string;
  total_sale_price: number;
  owner_base_amount: number;
  company_commission: number;
  amount_paid_to_owner: number;
  balance_due_to_owner: number;
  status: 'en_attente' | 'partiellement_paye' | 'solde';
  settlement_date?: string;
  payment_proof_ref?: string;
  created_at: string;
  updated_at: string;
}
