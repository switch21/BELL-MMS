export type AccountType = 'caisse' | 'banque';

export interface FinancialAccount {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  bank_name?: string;
  account_number?: string;
  currency: string;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialCategory {
  id: string;
  category_type: 'recette' | 'depense';
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export type ExpenseStatus = 'en_attente' | 'approuve' | 'rejete' | 'decaisse';

export interface ExpenseRequest {
  id: string;
  reference: string;
  category_code: string;
  category_name?: string;
  account_id: string;
  account_name?: string;
  beneficiary: string;
  amount: number;
  expense_date: string;
  description: string;
  requested_by_id: string;
  requested_by_name: string;
  requires_dg_approval: boolean;
  status: ExpenseStatus;
  approved_by_id?: string;
  approved_by_name?: string;
  approved_at?: string;
  approval_notes?: string;
  disbursed_at?: string;
  payment_proof_ref?: string;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'recette' | 'depense' | 'transfert_debit' | 'transfert_credit';

export interface FinancialTransaction {
  id: string;
  reference: string;
  account_id: string;
  account_name?: string;
  transaction_type: TransactionType;
  category_code?: string;
  amount: number;
  transaction_date: string;
  beneficiary_or_payer?: string;
  description: string;
  related_entity_type?: string;
  related_entity_id?: string;
  balance_after: number;
  created_by_name?: string;
  created_at: string;
}

export interface FinancialTransfer {
  id: string;
  reference: string;
  from_account_id: string;
  from_account_name: string;
  to_account_id: string;
  to_account_name: string;
  amount: number;
  transfer_date: string;
  reason: string;
  initiated_by_name: string;
  created_at: string;
}

export interface CashClosure {
  id: string;
  reference: string;
  account_id: string;
  account_name: string;
  closure_date: string;
  opening_balance: number;
  total_inflow: number;
  total_outflow: number;
  theoretical_balance: number;
  physical_count_balance: number;
  discrepancy: number; // physical - theoretical
  discrepancy_explanation?: string;
  closed_by_name: string;
  status: 'validee';
  created_at: string;
}
