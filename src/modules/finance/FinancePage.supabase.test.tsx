import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinancePage } from './FinancePage';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    errors: {} as Record<string, { message: string } | null>,
    rpcCalls: [] as Array<{ fn: string; args: any }>,
    rpcErrors: {} as Record<string, { message: string } | null>,
  };

  const from = vi.fn((table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: state.tables[table] ?? [], error: state.errors[table] ?? null }),
    };
    return builder;
  });

  const rpc = vi.fn((fn: string, args: any) => {
    state.rpcCalls.push({ fn, args });
    return Promise.resolve({ data: null, error: state.rpcErrors[fn] ?? null });
  });

  return { state, from, rpc };
});

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mockDb.from, rpc: mockDb.rpc },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-dg', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'dg@bell-mms.local' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

const ACCOUNTS = [
  {
    id: 'acc-caisse',
    code: 'CAISSE-PRINCIPALE',
    name: 'Caisse Centrale Akwa',
    account_type: 'caisse',
    currency: 'XAF',
    initial_balance: 5000000,
    current_balance: 4800000,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'acc-banque',
    code: 'BNK-UBA-DLA',
    name: 'Compte Courant UBA Cameroun',
    account_type: 'banque',
    bank_name: 'UBA Cameroun',
    account_number: '10033-05200-12345678901-44',
    currency: 'XAF',
    initial_balance: 25000000,
    current_balance: 24500000,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const EXPENSES = [
  {
    id: 'exp-1',
    reference: 'DEP-2026-ABC123',
    category_code: 'dep_travaux_viabilisation',
    account_id: 'acc-caisse',
    beneficiary: 'Cabinet Topo MBIA',
    amount: 500000,
    expense_date: '2026-11-10',
    description: 'Bornage du lotissement Akwa Nord',
    requested_by: 'user-collab',
    requested_by_name: 'Paul NGUE',
    requires_dg_approval: true,
    status: 'en_attente',
    created_at: '2026-11-10T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
  },
  {
    id: 'exp-2',
    reference: 'DEP-2026-DEF456',
    category_code: 'dep_frais_generaux',
    account_id: 'acc-caisse',
    beneficiary: 'Station Total Bonaberi',
    amount: 150000,
    expense_date: '2026-11-09',
    description: 'Carburant des véhicules de service',
    requested_by: 'user-collab',
    requested_by_name: 'Paul NGUE',
    requires_dg_approval: false,
    status: 'approuve',
    approved_by: 'user-dg',
    approved_by_name: 'Emmanuel FOTSO',
    created_at: '2026-11-09T08:00:00Z',
    updated_at: '2026-11-09T08:00:00Z',
  },
];

const TRANSFERS = [
  {
    id: 'trf-1',
    reference: 'TRF-2026-AA11BB',
    from_account_id: 'acc-banque',
    from_account_name: 'Compte Courant UBA Cameroun',
    to_account_id: 'acc-caisse',
    to_account_name: 'Caisse Centrale Akwa',
    amount: 1000000,
    transfer_date: '2026-11-08',
    reason: 'Alimentation de la caisse',
    initiated_by_name: 'Emmanuel FOTSO',
    created_at: '2026-11-08T08:00:00Z',
  },
];

const CLOSURES = [
  {
    id: 'clo-1',
    reference: 'CLO-2026-11-07-CAISSE-PRINCIPALE-1A2B',
    account_id: 'acc-caisse',
    account_name: 'Caisse Centrale Akwa',
    closure_date: '2026-11-07',
    opening_balance: 4700000,
    total_inflow: 300000,
    total_outflow: 200000,
    theoretical_balance: 4800000,
    physical_count_balance: 4790000,
    discrepancy: -10000,
    discrepancy_explanation: 'Reliquat de monnaie non justifié',
    closed_by_name: 'Emmanuel FOTSO',
    status: 'validee',
    created_at: '2026-11-07T18:00:00Z',
  },
];

const TRANSACTIONS = [
  {
    id: 'trx-1',
    reference: 'TRX-2026-ABC123',
    account_id: 'acc-caisse',
    transaction_type: 'depense',
    category_code: 'dep_frais_generaux',
    amount: 150000,
    transaction_date: '2026-11-09',
    beneficiary_or_payer: 'Station Total Bonaberi',
    description: 'Règlement dépense : Carburant',
    balance_after: 4800000,
    created_by_name: 'Emmanuel FOTSO',
    created_at: '2026-11-09T09:00:00Z',
  },
];

beforeEach(() => {
  mockDb.state.tables = {
    financial_accounts: ACCOUNTS,
    expense_requests: EXPENSES,
    financial_transfers: TRANSFERS,
    cash_closures: CLOSURES,
    financial_transactions: TRANSACTIONS,
  };
  mockDb.state.errors = {};
  mockDb.state.rpcCalls.length = 0;
  mockDb.state.rpcErrors = {};
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('FinancePage en mode connecté', () => {
  it('charge les comptes et les dépenses depuis Supabase', async () => {
    render(<FinancePage />);

    expect((await screen.findAllByText('Caisse Centrale Akwa')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\s?800\s?000 FCFA/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Dépenses & Approbations/ }));

    expect(await screen.findByText('DEP-2026-ABC123')).toBeInTheDocument();
    expect(screen.getAllByText('Paul NGUE')).toHaveLength(2);
    expect(screen.getAllByText('Caisse Centrale Akwa').length).toBeGreaterThan(0);
  });

  it('affiche une erreur explicite quand le chargement échoue', async () => {
    mockDb.state.errors = { financial_accounts: { message: 'permission denied' } };

    render(<FinancePage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les données financières depuis Supabase');
  });

  it('crée une demande de dépense via la fonction atomique', async () => {
    render(<FinancePage />);
    await screen.findAllByText('Caisse Centrale Akwa');

    fireEvent.click(screen.getByRole('button', { name: /Demande de Dépense/ }));
    fireEvent.change(screen.getByPlaceholderText(/Cabinet Topo MBIA/), {
      target: { value: 'Cabinet Topo MBIA' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Indiquez l'objet précis/), {
      target: { value: 'Bornage du lotissement' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Soumettre la Demande/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));

    expect(mockDb.state.rpcCalls[0]).toEqual({
      fn: 'create_expense_request',
      args: {
        p_category_code: 'dep_travaux_viabilisation',
        p_account_id: 'acc-caisse',
        p_beneficiary: 'Cabinet Topo MBIA',
        p_amount: 150000,
        p_description: 'Bornage du lotissement',
      },
    });
  });

  it('arbitre une dépense en attente via la fonction atomique', async () => {
    render(<FinancePage />);
    await screen.findAllByText('Caisse Centrale Akwa');

    fireEvent.click(screen.getByRole('button', { name: /Dépenses & Approbations/ }));
    await screen.findByText('DEP-2026-ABC123');
    fireEvent.click(screen.getByRole('button', { name: 'Arbitrer' }));

    fireEvent.change(screen.getByPlaceholderText(/mot de passe d'approbateur/), {
      target: { value: 'code-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer l'Arbitrage Financier/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));

    expect(mockDb.state.rpcCalls[0]).toEqual({
      fn: 'decide_expense_request',
      args: { p_expense_id: 'exp-1', p_decision: 'approuve', p_notes: null },
    });
  });

  it("décaissement d'une dépense approuvée via la fonction atomique", async () => {
    render(<FinancePage />);
    await screen.findAllByText('Caisse Centrale Akwa');

    fireEvent.click(screen.getByRole('button', { name: /Dépenses & Approbations/ }));
    await screen.findByText('DEP-2026-DEF456');
    fireEvent.click(screen.getByRole('button', { name: 'Décaisser' }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));

    expect(mockDb.state.rpcCalls[0]).toEqual({
      fn: 'disburse_expense_request',
      args: { p_expense_id: 'exp-2' },
    });
  });

  it('exécute un transfert inter-comptes via la fonction atomique', async () => {
    render(<FinancePage />);
    await screen.findAllByText('Caisse Centrale Akwa');

    fireEvent.click(screen.getByRole('button', { name: /Transfert Inter-Comptes/ }));
    fireEvent.click(screen.getByRole('button', { name: /Exécuter le Transfert Atomique/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));

    expect(mockDb.state.rpcCalls[0]).toEqual({
      fn: 'create_financial_transfer',
      args: {
        p_from_account_id: 'acc-banque',
        p_to_account_id: 'acc-caisse',
        p_amount: 1000000,
        p_reason: 'Alimentation de la Caisse Centrale pour frais opérationnels',
      },
    });
  });

  it('clôture une caisse via la fonction atomique', async () => {
    render(<FinancePage />);
    await screen.findAllByText('Caisse Centrale Akwa');

    fireEvent.click(screen.getByRole('button', { name: /Clôturer une Caisse/ }));
    fireEvent.click(screen.getByRole('button', { name: /Valider la Clôture Inaltérable/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));

    expect(mockDb.state.rpcCalls[0]).toEqual({
      fn: 'close_cash_account',
      args: { p_account_id: 'acc-caisse', p_physical_count: 4800000, p_explanation: null },
    });
  });
});
