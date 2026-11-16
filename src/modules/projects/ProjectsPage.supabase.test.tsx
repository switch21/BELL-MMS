import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProjectsPage } from './ProjectsPage';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    errors: {} as Record<string, { message: string } | null>,
    inserts: [] as Array<{ table: string; payload: any }>,
    updates: [] as Array<{ table: string; payload: any; id: string }>,
    deletes: [] as Array<{ table: string; id: string }>,
  };

  const read = (table: string) =>
    Promise.resolve({ data: state.tables[table] ?? [], error: state.errors[table] ?? null });

  const from = vi.fn((table: string) => ({
    select: () => ({
      order: () => read(table),
      eq: () => read(table),
    }),
    insert: (payload: any) => {
      state.inserts.push({ table, payload });
      const row = Array.isArray(payload) ? null : { id: 'wrk-new-1', ...payload };
      return {
        select: () => Promise.resolve({ data: row ? [row] : [], error: state.errors[table] ?? null }),
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: null, error: state.errors[table] ?? null }),
      };
    },
    update: (payload: any) => ({
      eq: (_column: string, id: string) => {
        state.updates.push({ table, payload, id });
        return Promise.resolve({ data: null, error: state.errors[table] ?? null });
      },
    }),
    delete: () => ({
      eq: (_column: string, id: string) => {
        state.deletes.push({ table, id });
        return Promise.resolve({ data: null, error: state.errors[table] ?? null });
      },
    }),
  }));

  return { state, from };
});

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mockDb.from },
}));

const auth = vi.hoisted(() => ({
  canManage: true,
  director: false,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-1', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'emmanuel@bell-mms.local' },
    hasRole: () => auth.director,
    hasPermission: (code: string) => auth.canManage && code === 'projects:manage',
    usersList: [],
  }),
}));

const PROJECT_ROW = {
  id: 'wrk-1',
  reference: 'TRV-2026-AAAA1111',
  title: 'Viabilisation section courante — PK 21',
  description: 'Ouverture de piste sur 400 m.',
  client_id: 'cli-1',
  plot_id: 'plt-1',
  site_location: 'PK 21, Douala',
  works_type: 'viabilisation',
  status: 'en_cours',
  budget_estimated: 48000000,
  budget_engaged: 31500000,
  cost_actual: 12800000,
  start_date: '2026-10-01',
  target_end_date: '2026-12-15',
  actual_end_date: null,
  reception_status: 'programmee',
  reception_date: null,
  reception_notes: null,
  assigned_to: 'user-1',
  assigned_to_name: 'Emmanuel FOTSO',
  created_by: 'user-1',
  created_by_name: 'Emmanuel FOTSO',
  notes: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const STEP_ROWS = [
  {
    id: 'st-1',
    project_id: 'wrk-1',
    step_order: 1,
    title: 'Étude technique et implantation',
    status: 'termine',
    due_date: null,
    completed_at: '2026-10-09T00:00:00Z',
    completed_by: 'user-1',
    completed_by_name: 'Emmanuel FOTSO',
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-09T00:00:00Z',
  },
  {
    id: 'st-2',
    project_id: 'wrk-1',
    step_order: 2,
    title: 'Ouverture de piste et terrassement',
    status: 'en_cours',
    due_date: null,
    completed_at: null,
    completed_by: null,
    completed_by_name: null,
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-09T00:00:00Z',
  },
];

beforeEach(() => {
  mockDb.state.tables = {
    work_projects: [PROJECT_ROW],
    work_project_steps: STEP_ROWS,
    clients: [{ id: 'cli-1', client_type: 'entreprise', company_name: 'SCI LOBE RESIDENCE', code: 'CLI-2026-002' }],
    plots: [{ id: 'plt-1', plot_number: 'Lot 14', area_sqm: 450 }],
    profiles: [{ id: 'user-1', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'emmanuel@bell-mms.local' }],
  };
  mockDb.state.errors = {};
  mockDb.state.inserts.length = 0;
  mockDb.state.updates.length = 0;
  mockDb.state.deletes.length = 0;
  auth.canManage = true;
  auth.director = false;
});

describe('ProjectsPage en mode connecté', () => {
  it('charge les chantiers et leurs étapes depuis Supabase', async () => {
    render(<ProjectsPage />);

    expect(await screen.findByText('TRV-2026-AAAA1111')).toBeInTheDocument();
    expect(screen.getByText('Viabilisation section courante — PK 21')).toBeInTheDocument();
    expect(screen.getByText(/1 en cours/)).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
    expect(mockDb.state.tables.work_projects).toHaveLength(1);
  });

  it('affiche une erreur explicite quand le chargement échoue', async () => {
    mockDb.state.errors = { work_projects: { message: 'permission denied for table work_projects' } };

    render(<ProjectsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les chantiers depuis Supabase');
  });

  it('crée le chantier puis génère les cinq étapes du canevas', async () => {
    render(<ProjectsPage />);
    await screen.findByText('TRV-2026-AAAA1111');

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir un chantier/ }));
    fireEvent.change(screen.getByPlaceholderText('Viabilisation du lotissement La Grâce Japoma'), {
      target: { value: 'Terrassement place centrale' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer et générer les étapes/ }));

    await waitFor(() => expect(mockDb.state.inserts).toHaveLength(2));

    const [projectInsert, stepsInsert] = mockDb.state.inserts;
    expect(projectInsert.table).toBe('work_projects');
    expect(projectInsert.payload).toMatchObject({
      title: 'Terrassement place centrale',
      works_type: 'viabilisation',
      status: 'en_etude',
      assigned_to: 'user-1',
      created_by: 'user-1',
    });
    expect(projectInsert.payload.reference).toMatch(/^TRV-\d{4}-[A-Z0-9]{8}$/);

    expect(stepsInsert.table).toBe('work_project_steps');
    expect(stepsInsert.payload).toHaveLength(5);
    expect(stepsInsert.payload[0]).toMatchObject({ step_order: 1, status: 'en_cours' });
    expect(stepsInsert.payload[4]).toMatchObject({ step_order: 5, status: 'en_attente' });
    expect(stepsInsert.payload[4].title).toBe('Réception de travaux et PV');
  });

  it('refuse la création quand la fin prévisionnelle précède le début', async () => {
    render(<ProjectsPage />);
    await screen.findByText('TRV-2026-AAAA1111');

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir un chantier/ }));
    fireEvent.change(screen.getByPlaceholderText('Viabilisation du lotissement La Grâce Japoma'), {
      target: { value: 'Chantier incohérent' },
    });
    fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-12-20' } });
    fireEvent.change(screen.getByLabelText('Fin prévisionnelle'), { target: { value: '2026-12-10' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer et générer les étapes/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('La fin prévisionnelle ne peut pas précéder le début du chantier.');
    expect(mockDb.state.inserts).toHaveLength(0);
  });

  it('clôture une étape dans work_project_steps et relance la lecture', async () => {
    render(<ProjectsPage />);
    await screen.findByText('TRV-2026-AAAA1111');

    fireEvent.click(screen.getByRole('button', { name: /Suivre/ }));
    fireEvent.click(screen.getByRole('button', { name: "Clôturer l'étape 2" }));

    await waitFor(() => expect(mockDb.state.updates.length).toBeGreaterThan(0));
    const stepUpdate = mockDb.state.updates.find((entry) => entry.table === 'work_project_steps');
    expect(stepUpdate).toMatchObject({ id: 'st-2' });
    expect(stepUpdate?.payload).toMatchObject({
      status: 'termine',
      completed_by: 'user-1',
      completed_by_name: 'Emmanuel FOTSO',
    });
  });

  it('fait avancer le statut du chantier via la table work_projects', async () => {
    render(<ProjectsPage />);
    await screen.findByText('TRV-2026-AAAA1111');

    fireEvent.click(screen.getByRole('button', { name: /Terminé/ }));

    await waitFor(() => expect(mockDb.state.updates).toHaveLength(1));
    expect(mockDb.state.updates[0]).toMatchObject({ table: 'work_projects', id: 'wrk-1' });
    expect(mockDb.state.updates[0].payload).toMatchObject({ status: 'termine' });
  });

  it('reserve la création aux porteurs du droit', async () => {
    auth.canManage = false;

    render(<ProjectsPage />);
    await screen.findByText('TRV-2026-AAAA1111');

    expect(screen.queryByRole('button', { name: /Ouvrir un chantier/ })).not.toBeInTheDocument();
    expect(screen.getByText(/réservées aux porteurs du droit/)).toBeInTheDocument();
  });

  it('reserve la suppression à la direction', async () => {
    render(<ProjectsPage />);
    await screen.findByText('TRV-2026-AAAA1111');
    expect(screen.queryByRole('button', { name: 'Supprimer TRV-2026-AAAA1111' })).not.toBeInTheDocument();

    auth.director = true;
    render(<ProjectsPage />);
    await screen.findByText('TRV-2026-AAAA1111');

    const deleteButton = await screen.findByRole('button', { name: 'Supprimer TRV-2026-AAAA1111' });
    fireEvent.click(deleteButton);
    await waitFor(() => expect(mockDb.state.deletes).toHaveLength(1));
    expect(mockDb.state.deletes[0]).toMatchObject({ table: 'work_projects', id: 'wrk-1' });
  });
});
