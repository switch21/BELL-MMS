import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ServicesPage } from './ServicesPage';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    errors: {} as Record<string, { message: string } | null>,
    inserts: [] as Array<{ table: string; payload: any }>,
    updates: [] as Array<{ table: string; payload: any; id: string }>,
  };

  const from = vi.fn((table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: state.tables[table] ?? [], error: state.errors[table] ?? null }),
      insert: (payload: any) => {
        state.inserts.push({ table, payload });
        return Promise.resolve({ data: null, error: state.errors[table] ?? null });
      },
      update: (payload: any) => ({
        eq: (_column: string, id: string) => {
          state.updates.push({ table, payload, id });
          return Promise.resolve({ data: null, error: state.errors[table] ?? null });
        },
      }),
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
    currentUser: { id: 'user-1', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'emmanuel@bell-mms.local' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

const SERVICE_TYPES = [
  {
    id: 'st-1',
    code: 'mutation_totale',
    name: 'Mutation Foncière Totale',
    description: 'Transfert intégral de propriété',
    standard_fee: 750000,
    estimated_duration_days: 60,
    required_documents: [],
    is_active: true,
  },
];

const CLIENTS = [
  {
    id: 'cli-1',
    code: 'CLI-2026-001',
    client_type: 'particulier',
    first_name: 'Paul',
    last_name: 'NGUE',
    phone: '+237600000000',
    email: 'paul@example.cm',
    address: 'Douala',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
];

const CASE_ROW = {
  id: 'case-1',
  reference: 'DOS-2026-A1B2C3D4',
  client_id: 'cli-1',
  service_type_id: 'st-1',
  title: 'Mutation TF 19402/Wouri',
  assigned_to: 'user-1',
  assigned_to_name: 'Emmanuel FOTSO',
  opened_date: '2026-11-01',
  target_date: null,
  closing_date: null,
  status: 'pieces_en_cours',
  fee_agreed: 750000,
  expenses_estimated: 350000,
  expenses_actual: 0,
  amount_paid: 0,
  dg_validation_status: 'non_soumis',
  dg_notes: null,
  notes: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  steps: [
    { id: 'step-1', case_id: 'case-1', step_order: 1, title: 'Collecte et examen des pièces justificatives', status: 'en_cours' },
    { id: 'step-2', case_id: 'case-1', step_order: 2, title: 'Rédaction technique / acte notarié / requête TPI', status: 'en_attente' },
  ],
};

beforeEach(() => {
  mockDb.state.tables = {
    service_cases: [CASE_ROW],
    service_types: SERVICE_TYPES,
    clients: CLIENTS,
  };
  mockDb.state.errors = {};
  mockDb.state.inserts.length = 0;
  mockDb.state.updates.length = 0;
});

describe('ServicesPage en mode connecté', () => {
  it('charge les dossiers et leurs étapes depuis Supabase', async () => {
    render(<ServicesPage />);

    expect(await screen.findByText('DOS-2026-A1B2C3D4')).toBeInTheDocument();
    expect(screen.getByText('Mutation TF 19402/Wouri')).toBeInTheDocument();
    expect(screen.getByText('Emmanuel FOTSO')).toBeInTheDocument();
    expect(screen.getByText('1 dossiers')).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
  });

  it('affiche une erreur explicite quand le chargement échoue', async () => {
    mockDb.state.errors = { service_cases: { message: 'permission denied' } };

    render(<ServicesPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les dossiers de prestations depuis Supabase');
  });

  it('crée le dossier puis ses cinq étapes dans Supabase', async () => {
    render(<ServicesPage />);
    await screen.findByText('DOS-2026-A1B2C3D4');

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir un Dossier de Prestation/ }));
    fireEvent.change(screen.getByPlaceholderText(/Mutation Foncière TF 2011/), {
      target: { value: 'Dossier de test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer & Générer le Workflow/ }));

    await waitFor(() => expect(mockDb.state.inserts).toHaveLength(2));

    const [caseInsert, stepsInsert] = mockDb.state.inserts;
    expect(caseInsert.table).toBe('service_cases');
    expect(caseInsert.payload).toMatchObject({
      client_id: 'cli-1',
      service_type_id: 'st-1',
      title: 'Dossier de test',
      status: 'pieces_en_cours',
      assigned_to: 'user-1',
      assigned_to_name: 'Emmanuel FOTSO',
    });
    expect(caseInsert.payload.reference).toMatch(/^DOS-\d{4}-[A-Z0-9]{8}$/);

    expect(stepsInsert.table).toBe('service_case_steps');
    expect(stepsInsert.payload).toHaveLength(5);
    expect(stepsInsert.payload[0]).toMatchObject({ step_order: 1, status: 'en_cours' });
    expect(stepsInsert.payload[4]).toMatchObject({ step_order: 5, status: 'en_attente' });
  });

  it('met à jour une étape via la table service_case_steps', async () => {
    render(<ServicesPage />);
    await screen.findByText('DOS-2026-A1B2C3D4');

    fireEvent.click(screen.getByRole('button', { name: /Gérer le Dossier/ }));
    fireEvent.click(screen.getByText('Collecte et examen des pièces justificatives'));

    await waitFor(() => expect(mockDb.state.updates).toHaveLength(1));

    const [stepUpdate] = mockDb.state.updates;
    expect(stepUpdate.table).toBe('service_case_steps');
    expect(stepUpdate.id).toBe('step-1');
    expect(stepUpdate.payload).toMatchObject({
      status: 'termine',
      completed_by: 'user-1',
      completed_by_name: 'Emmanuel FOTSO',
    });
  });
});
