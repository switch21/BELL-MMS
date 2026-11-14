import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThirdPartySalesPage } from './sales/ThirdPartySalesPage';
import { CollaboratorDashboard } from './dashboard/CollaboratorDashboard';
import { SecretaryDashboard } from './dashboard/SecretaryDashboard';
import { AdminDashboard } from './dashboard/AdminDashboard';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    errors: {} as Record<string, { message: string } | null>,
    rpcCalls: [] as Array<{ fn: string; args: any }>,
    rpcErrors: {} as Record<string, { message: string } | null>,
    queries: [] as Array<{ table: string; method: string; args: any[] }>,
  };

  const makeBuilder = (table: string) => {
    const builder: any = {};
    const record = (method: string) => (...args: any[]) => {
      state.queries.push({ table, method, args });
      return builder;
    };

    builder.select = (...args: any[]) => {
      state.queries.push({ table, method: 'select', args });
      return builder;
    };
    builder.eq = record('eq');
    builder.in = record('in');
    builder.gte = record('gte');
    builder.order = record('order');
    builder.limit = record('limit');

    builder.then = (onFulfilled: any, onRejected: any) => {
      const data = state.tables[table] ?? [];
      return Promise.resolve({
        data,
        error: state.errors[table] ?? null,
        count: data.length,
      }).then(onFulfilled, onRejected);
    };

    return builder;
  };

  const from = vi.fn((table: string) => makeBuilder(table));
  const rpc = vi.fn((fn: string, args: any) => {
    state.rpcCalls.push({ fn, args });
    return Promise.resolve({ data: null, error: state.rpcErrors[fn] ?? null });
  });

  return { state, from, rpc };
});

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mockDb.from, rpc: mockDb.rpc },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-collab', first_name: 'Paul', last_name: 'NGUE', email: 'collab@bell-mms.local' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

const SETTLEMENTS = [
  {
    id: 'set-1',
    reference: 'REV-2026-777',
    partner_id: 'partner-1',
    partner: { name: 'Famille MBIA' },
    sale_id: 'sale-1',
    sale: { reference: 'VTE-2026-901', plot: { plot_number: 'Lot 42' } },
    total_sale_price: 5000000,
    owner_base_amount: 4000000,
    company_commission: 1000000,
    amount_paid_to_owner: 1000000,
    balance_due_to_owner: 3000000,
    status: 'partiellement_paye',
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-01T08:00:00Z',
  },
];

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
];

const COLLABORATOR_CASES = [
  {
    id: 'case-1',
    reference: 'MUT-2026-042',
    title: 'Mutation TF 19402',
    status: 'pieces_en_cours',
    dg_validation_status: 'non_soumis',
    opened_date: '2026-11-01',
    target_date: '2026-12-20',
    steps: [
      { id: 'step-1', case_id: 'case-1', step_order: 1, title: 'Collecter les pièces justificatives', status: 'en_cours' },
      { id: 'step-2', case_id: 'case-1', step_order: 2, title: 'Dépôt au cadastre', status: 'en_attente' },
      { id: 'step-3', case_id: 'case-1', step_order: 3, title: 'Remise des actes', status: 'termine' },
    ],
  },
  {
    id: 'case-2',
    reference: 'JUG-2026-009',
    title: 'Jugement hérédité',
    status: 'soumis_validation_dg',
    dg_validation_status: 'en_attente',
    opened_date: '2026-10-01',
    target_date: '2020-01-01',
    steps: [
      { id: 'step-4', case_id: 'case-2', step_order: 1, title: 'Transmettre la requête au notaire', status: 'bloque' },
    ],
  },
  {
    id: 'case-3',
    reference: 'MUT-2026-050',
    title: 'Mutation Japoma',
    status: 'instruction_cadastre',
    dg_validation_status: 'non_soumis',
    opened_date: '2026-09-01',
    target_date: '2020-02-01',
    steps: [
      { id: 'step-5', case_id: 'case-3', step_order: 1, title: 'Déposer le plan de bornage', status: 'en_attente' },
    ],
  },
];

const daysFromNow = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const localTodayIso = (): string => daysFromNow(0);

const SECRETARY_DATA = {
  service_cases: [
    {
      id: 'case-10',
      reference: 'MUT-2026-101',
      title: 'Mutation Bonamoussadi',
      status: 'pieces_en_cours',
      opened_date: '2026-11-02',
      client: { first_name: 'Alice', last_name: 'NDONGO' },
      steps: [],
    },
  ],
  reservations: [
    {
      id: 'res-1',
      reference: 'RES-2026-303',
      agreed_price: 1500000,
      expiration_date: daysFromNow(3),
      status: 'active',
      client: { company_name: 'SARL BOIS' },
      plot: { plot_number: 'Lot 7' },
    },
  ],
  receipts: [
    {
      id: 'rec-1',
      reference: 'REC-2026-501',
      amount: 250000,
      payment_date: localTodayIso(),
      payment_method: 'especes',
      created_at: new Date().toISOString(),
    },
  ],
  clients: [
    {
      id: 'cli-1',
      code: 'CLI-2026-001',
      last_name: 'NDONGO',
      first_name: 'Alice',
      phone: '699000000',
      city: 'Douala',
      created_at: new Date().toISOString(),
    },
  ],
};

const ADMIN_DATA = {
  profiles: [
    {
      id: 'u1',
      first_name: 'Emmanuel',
      last_name: 'FOTSO',
      email: 'dg@bell-mms.local',
      role_id: 'role-dg',
      role: { code: 'directeur_general', name: 'Directeur Général' },
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'u2',
      first_name: 'Chantal',
      last_name: 'NGO',
      email: 'admin@bell-mms.local',
      role_id: 'role-super',
      role: { code: 'super_admin', name: 'Super Administrateur' },
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'u3',
      first_name: 'Paul',
      last_name: 'NGUE',
      email: 'collab@bell-mms.local',
      role_id: 'role-collab',
      role: { code: 'collaborateur', name: 'Collaborateur' },
      is_active: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  roles: [
    { id: 'role-dg', code: 'directeur_general', name: 'Directeur Général', description: 'Supervision intégrale', is_system: true },
    { id: 'role-super', code: 'super_admin', name: 'Super Administrateur', description: 'Maintenance technique', is_system: true },
    { id: 'role-collab', code: 'collaborateur', name: 'Collaborateur', description: 'Exécution opérationnelle', is_system: true },
  ],
  audit_logs: [
    {
      id: 'log-1',
      user_id: 'u1',
      user_email: 'dg@bell-mms.local',
      action: 'UPDATE',
      module: 'FINANCE',
      entity_name: 'expense_requests',
      entity_id: 'exp-1',
      old_values: null,
      new_values: null,
      created_at: new Date().toISOString(),
    },
    {
      id: 'log-2',
      user_id: null,
      user_email: null,
      action: 'DELETE',
      module: 'LAND',
      entity_name: 'plots',
      entity_id: 'plot-1',
      old_values: null,
      new_values: null,
      created_at: new Date().toISOString(),
    },
  ],
};

beforeEach(() => {
  mockDb.state.tables = {};
  mockDb.state.errors = {};
  mockDb.state.rpcCalls.length = 0;
  mockDb.state.rpcErrors = {};
  mockDb.state.queries = [];
});

const setTables = (
  tables: Record<string, any[]>,
  errors: Record<string, { message: string } | null> = {}
) => {
  mockDb.state.tables = tables;
  mockDb.state.errors = errors;
};

const renderWithRouter = (element: React.ReactElement) =>
  render(<MemoryRouter>{element}</MemoryRouter>);

describe('ThirdPartySalesPage en mode connecté', () => {
  const SETTLEMENT_TABLES = {
    third_party_settlements: SETTLEMENTS,
    financial_accounts: ACCOUNTS,
  };

  it('charge les reversements avec propriétaire, vente et parcelle joints', async () => {
    setTables(SETTLEMENT_TABLES);
    renderWithRouter(<ThirdPartySalesPage />);

    expect(await screen.findByText('Famille MBIA')).toBeInTheDocument();
    expect(screen.getByText('Lot 42')).toBeInTheDocument();
    expect(screen.getByText('REV-2026-777')).toBeInTheDocument();
    expect(screen.getByText('Partiel')).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
  });

  it('enregistre un reversement via la fonction atomique avec le compte sélectionné', async () => {
    setTables(SETTLEMENT_TABLES);
    renderWithRouter(<ThirdPartySalesPage />);
    await screen.findByText('Famille MBIA');

    fireEvent.click(screen.getByRole('button', { name: 'Reverser' }));
    fireEvent.change(screen.getByPlaceholderText(/CHQ-BICEC/), {
      target: { value: 'CHQ-BICEC-004812' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer le Reversement/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));

    expect(mockDb.state.rpcCalls[0]).toEqual({
      fn: 'record_owner_settlement_payment',
      args: {
        p_settlement_id: 'set-1',
        p_account_id: 'acc-caisse',
        p_amount: 3000000,
        p_proof_ref: 'CHQ-BICEC-004812',
      },
    });
  });

  it('affiche le refus de la fonction atomique sans fermer la modale', async () => {
    setTables(SETTLEMENT_TABLES);
    mockDb.state.rpcErrors = {
      record_owner_settlement_payment: { message: 'Solde insuffisant sur Caisse Centrale Akwa' },
    };

    renderWithRouter(<ThirdPartySalesPage />);
    await screen.findByText('Famille MBIA');

    fireEvent.click(screen.getByRole('button', { name: 'Reverser' }));
    fireEvent.change(screen.getByPlaceholderText(/CHQ-BICEC/), {
      target: { value: 'CHQ-BICEC-004812' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer le Reversement/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reversement refusé : Solde insuffisant sur Caisse Centrale Akwa'
    );
    expect(mockDb.state.rpcCalls).toHaveLength(1);
  });
});

describe('CollaboratorDashboard en mode connecté', () => {
  const COLLABORATOR_TABLES = { service_cases: COLLABORATOR_CASES };

  it('ne charge que les dossiers assignés à l’utilisateur connecté', async () => {
    setTables(COLLABORATOR_TABLES);
    renderWithRouter(<CollaboratorDashboard />);

    expect(await screen.findByText('Collecter les pièces justificatives')).toBeInTheDocument();
    expect(screen.getByText('Transmettre la requête au notaire')).toBeInTheDocument();

    expect(mockDb.state.queries).toContainEqual({
      table: 'service_cases',
      method: 'eq',
      args: ['assigned_to', 'user-collab'],
    });
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
  });

  it('calcule les indicateurs à partir des étapes réelles', async () => {
    setTables(COLLABORATOR_TABLES);
    renderWithRouter(<CollaboratorDashboard />);

    expect(await screen.findByText('3 dossiers')).toBeInTheDocument();
    expect(screen.getByText('4 tâches')).toBeInTheDocument();
    expect(screen.getByText('Soumis au Directeur Général')).toBeInTheDocument();
    expect(screen.getByText('Dossier #JUG-2026-009')).toBeInTheDocument();
    expect(screen.getByText('Bloquée')).toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
  });
});

describe('SecretaryDashboard en mode connecté', () => {
  it('charge les dossiers en préparation, réservations, reçus du jour et clients', async () => {
    setTables(SECRETARY_DATA);
    renderWithRouter(<SecretaryDashboard />);

    expect(await screen.findByText('MUT-2026-101')).toBeInTheDocument();
    expect(screen.getByText('SARL BOIS')).toBeInTheDocument();
    expect(screen.getByText(/Lot 7/)).toBeInTheDocument();
    expect(screen.getByText(/250\s?000 FCFA encaissés/)).toBeInTheDocument();
    expect(screen.getAllByText('Alice NDONGO').length).toBeGreaterThan(0);
  });

  it('interroge les bons périmètres (statuts, réservations actives, reçus du jour)', async () => {
    setTables(SECRETARY_DATA);
    renderWithRouter(<SecretaryDashboard />);
    await screen.findByText('MUT-2026-101');

    expect(mockDb.state.queries).toContainEqual({
      table: 'service_cases',
      method: 'in',
      args: ['status', ['creation', 'pieces_en_cours', 'instruction_cadastre']],
    });
    expect(mockDb.state.queries).toContainEqual({
      table: 'reservations',
      method: 'eq',
      args: ['status', 'active'],
    });
    expect(mockDb.state.queries).toContainEqual({
      table: 'receipts',
      method: 'eq',
      args: ['payment_date', localTodayIso()],
    });
  });

  it('ne réaffiche pas les données de démonstration (courriers, rendez-vous)', async () => {
    setTables(SECRETARY_DATA);
    renderWithRouter(<SecretaryDashboard />);
    await screen.findByText('MUT-2026-101');

    expect(screen.queryByText('5 courriers')).not.toBeInTheDocument();
    expect(screen.queryByText('4 rendez-vous')).not.toBeInTheDocument();
    expect(screen.queryByText('2 reçus')).not.toBeInTheDocument();
    expect(screen.queryByText('Courriers Arrivés Récents')).not.toBeInTheDocument();
  });
});

describe('AdminDashboard en mode connecté', () => {
  it('calcule les comptes actifs et la répartition réelle des rôles', async () => {
    setTables(ADMIN_DATA);
    renderWithRouter(<AdminDashboard />);

    expect(await screen.findByText('2 comptes')).toBeInTheDocument();
    expect(screen.getByText('1 compte désactivé')).toBeInTheDocument();
    expect(screen.getByText('Directeur Général (directeur_general)')).toBeInTheDocument();
    expect(screen.getByText('Collaborateur (collaborateur)')).toBeInTheDocument();
    expect(screen.getAllByText('1 utilisateur')).toHaveLength(2);
    expect(screen.getByText('0 utilisateur')).toBeInTheDocument();
  });

  it('affiche les derniers événements d’audit réels', async () => {
    setTables(ADMIN_DATA);
    renderWithRouter(<AdminDashboard />);

    expect(await screen.findByText(/expense_requests/)).toBeInTheDocument();
    expect(screen.getByText(/plots/)).toBeInTheDocument();
    expect(screen.getByText('Mise à jour')).toBeInTheDocument();
    expect(screen.getByText('Suppression')).toBeInTheDocument();
    expect(screen.getByText(/^Système ·/)).toBeInTheDocument();

    expect(mockDb.state.queries).toContainEqual({
      table: 'audit_logs',
      method: 'limit',
      args: [5],
    });
    expect(mockDb.state.queries).toContainEqual({
      table: 'audit_logs',
      method: 'gte',
      args: ['created_at', expect.any(String)],
    });
  });

  it('retire les métriques statiques non vérifiables', async () => {
    setTables(ADMIN_DATA);
    renderWithRouter(<AdminDashboard />);
    await screen.findByText('2 comptes');

    expect(screen.queryByText('Politiques RLS')).not.toBeInTheDocument();
    expect(screen.queryByText('3 appliquées')).not.toBeInTheDocument();
    expect(screen.queryByText('Immuable')).not.toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
  });
});
