export type UserRoleCode = 'super_admin' | 'directeur_general' | 'secretaire' | 'collaborateur';

export interface UserRole {
  id: string;
  code: UserRoleCode;
  name: string;
  description: string;
  is_system: boolean;
}

export interface Permission {
  id: string;
  code: string;
  module: string;
  name: string;
  description: string;
}

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role_id: string;
  role?: UserRole;
  job_title?: string;
  is_active: boolean;
  theme_preference: 'light' | 'dark' | 'system';
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VALIDATE' | 'LOGIN' | 'REJECT';
  module: string;
  entity_name: string;
  entity_id: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address?: string;
  created_at: string;
}

export interface AppSettings {
  id: string;
  company_name: string;
  legal_form: string;
  rccm: string;
  niu: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  currency_symbol: string;
  default_reservation_duration_days: number;
  expense_approval_threshold_dg: number;
  created_at: string;
  updated_at: string;
}
