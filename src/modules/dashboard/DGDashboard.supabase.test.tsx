import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DGDashboard } from './DGDashboard';

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

const SALES = [
  {
    id: 'sale-1',
    reference: 'VTE-2026-001',
    client_id: 'cli-1',
    plot_id: 'plot-1',
    sale_type: 'comptant',
    sale_date: '2026-10-15',
    total_price: 2000000,
    discount_amount: 0,
    final_price: 2000000,
    initial_deposit: 2000000,
    remaining_balance: 0,
    payment_method: 'virement',
    status: 'soldee',
    created_at: '2026-10-15T00:00:00Z',
    updated_at: '2026-10-15T00:00:00Z',
  },
  {
    id: 'sale-2',
    reference: 'VTE-2026-002',
    client_id: 'cli-2',
    plot_id: 'plot-2',
    sale_type: 'comptant',
    sale_date: '2026-10-20',
    total_price: 1000000,
    discount_amount: 0,
    final_price: 1000000,
    initial_deposit: 1000000,
    remaining_balance: 0,
    payment_method: 'especes',
    status: 'soldee',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  },
  {
    id: 'sale-3',
    reference: 'VTE-2026-003',
    client_id: 'cli-3',
    plot_id: 'plot-3',
    sale_type: 'echelonne',
    sale_date: '2026-11-02',
    total_price: 5000000,
    discount_amount: 0,
    final_price: 5000000,
    initial_deposit: 1000000,
    remaining_balance: 4000000,
    payment_method: 'virement',
    status: 'en_cours',
    created_at: '2026-11-02T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
  },
];

const PLOTS = [
  { id: 'plot-1', plot_number: 'A-01', status: 'vendue' },
  { id: 'plot-2', plot_number: 'A-02', status: 'vendue' },
  { id: 'plot-3', plot_number: 'A-03', status: 'reservee' },
  { id: 'plot-4', plot_number: 'A-04', status: 'disponible' },
];

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
    currency: 'XAF',
    initial_balance: 4000000,
    current_balance: 4000000,
    is_active: true,
  },
];

const EXPENSES = [
  {
    id: 'exp-1',
    reference: 'DEP-2026-ABC123',
    category_code: 'dep_travaux_viabilisation',
    account_id: 'acc-caisse',
    beneficiary: 'Cabinet Topo MBIA',
    amount: 300000,
    expense_date: '2026-11-10',
    description: 'Bornage',
    requested_by: 'user-collab',
    requested_by_name: 'Paul NGUE',
    requires_dg_approval: true,
    status: 'en_attente',
    created_at: '2026-11-10T00:00:00Z',
    updated_at: '2026-11-10T00:00:00Z',
  },
  {
    id: 'exp-2',
    reference: 'DEP-2026-DEF456',
    category_code: 'dep_frais_generaux',
    account_id: 'acc-caisse',
    beneficiary: 'Station Total',
    amount: 100000,
    expense_date: '2026-11-05',
    description: 'Carburant',
    requested_by: 'user-collab',
    requested_by_name: 'Paul NGUE',
    requires_dg_approval: false,
    status: 'decaisse',
    created_at: '2026-11-05T00:00:00Z',
    updated_at: '2026-11-05T00:00:00Z',
  },
];

beforeEach(() => {
  mockDb.state.tables = {
    sales: SALES,
    plots: PLOTS,
    financial_accounts: ACCOUNTS,
    expense_requests: EXPENSES,
  };
  mockDb.state.errors = {};
});

describe('DGDashboard en mode connecté', () => {
  it('calcule les KPI depuis Supabase', async () => {
    render(
      <MemoryRouter>
        <DGDashboard />
      </MemoryRouter>
    );

    await screen.findByText('Cabinet Topo MBIA');

    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
    expect(screen.getAllByText(/3\s?000\s?000 FCFA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5\s?000\s?000 FCFA/).length).toBeGreaterThan(0);
    expect(screen.getByText(/totales/)).toHaveTextContent('/ 4 totales');
    expect(screen.getByText('1 dépenses')).toBeInTheDocument();
    expect(screen.getAllByText(/300\s?000 FCFA/).length).toBeGreaterThan(0);
  });

  it('affiche une erreur explicite quand le chargement échoue', async () => {
    mockDb.state.errors = { sales: { message: 'permission denied' } };

    render(
      <MemoryRouter>
        <DGDashboard />
      </MemoryRouter>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les indicateurs de direction depuis Supabase');
  });
});
