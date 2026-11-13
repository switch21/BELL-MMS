import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinancialReportsPage } from './FinancialReportsPage';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    errors: {} as Record<string, { message: string } | null>,
  };

  const from = vi.fn((table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: state.tables[table] ?? [], error: state.errors[table] ?? null }),
    };
    return builder;
  });

  return { state, from };
});

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mockDb.from },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-dg', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'dg@bell-mms.local' },
  }),
}));

const ACCOUNTS = [
  {
    id: 'acc-caisse',
    code: 'CAISSE-PRINCIPALE',
    name: 'Caisse Centrale Akwa',
    account_type: 'caisse',
    currency: 'XAF',
    initial_balance: 1000000,
    current_balance: 1000000,
    is_active: true,
  },
  {
    id: 'acc-banque',
    code: 'BNK-UBA-DLA',
    name: 'Compte Courant UBA Cameroun',
    account_type: 'banque',
    bank_name: 'UBA Cameroun',
    currency: 'XAF',
    initial_balance: 2000000,
    current_balance: 2000000,
    is_active: true,
  },
];

const TRANSACTIONS = [
  {
    id: 'trx-1',
    reference: 'TRX-2026-REC001',
    account_id: 'acc-caisse',
    transaction_type: 'recette',
    amount: 500000,
    transaction_date: '2026-11-05',
    beneficiary_or_payer: 'Paul NGUE',
    description: 'Encaissement vente',
    balance_after: 1500000,
    created_at: '2026-11-05T09:00:00Z',
  },
  {
    id: 'trx-2',
    reference: 'TRX-2026-DEP001',
    account_id: 'acc-caisse',
    transaction_type: 'depense',
    category_code: 'dep_frais_generaux',
    amount: 200000,
    transaction_date: '2026-11-06',
    beneficiary_or_payer: 'Station Total',
    description: 'Carburant des véhicules',
    balance_after: 1300000,
    created_at: '2026-11-06T09:00:00Z',
  },
];

const SALES = [
  {
    id: 'sale-1',
    reference: 'VTE-2026-001',
    client_id: 'cli-1',
    client: { id: 'cli-1', first_name: 'Paul', last_name: 'NGUE' },
    plot_id: 'plot-1',
    sale_type: 'echelonne',
    sale_date: '2026-10-15',
    total_price: 1000000,
    discount_amount: 0,
    final_price: 1000000,
    initial_deposit: 250000,
    remaining_balance: 750000,
    payment_method: 'virement',
    status: 'en_cours',
    is_third_party_plot: true,
    bell_margin_amount: 100000,
    created_at: '2026-10-15T00:00:00Z',
    updated_at: '2026-10-15T00:00:00Z',
  },
];

const SETTLEMENTS = [
  {
    id: 'stl-1',
    reference: 'REV-2026-001',
    partner_id: 'partner-1',
    sale_id: 'sale-1',
    total_sale_price: 1000000,
    owner_base_amount: 800000,
    company_commission: 100000,
    amount_paid_to_owner: 400000,
    balance_due_to_owner: 400000,
    status: 'partiellement_paye',
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
  },
];

beforeEach(() => {
  mockDb.state.tables = {
    financial_accounts: ACCOUNTS,
    financial_transactions: TRANSACTIONS,
    sales: SALES,
    third_party_settlements: SETTLEMENTS,
  };
  mockDb.state.errors = {};
});

describe('FinancialReportsPage en mode connecté', () => {
  it('calcule la synthèse depuis Supabase', async () => {
    render(<FinancialReportsPage />);

    await screen.findByText('VTE-2026-001');

    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
    expect(screen.getAllByText(/3\s?000\s?000 FCFA/).length).toBeGreaterThan(0);
    expect(screen.getByText('2 écritures')).toBeInTheDocument();
    expect(screen.getAllByText('Paul NGUE').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('TRX-2026-DEP001')).toBeInTheDocument();
    expect(screen.getAllByText(/750\s?000 FCFA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/400\s?000 FCFA/).length).toBeGreaterThan(0);
  });

  it('affiche une erreur explicite quand le chargement échoue', async () => {
    mockDb.state.errors = { financial_transactions: { message: 'permission denied' } };

    render(<FinancialReportsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger la synthèse financière depuis Supabase');
  });
});
