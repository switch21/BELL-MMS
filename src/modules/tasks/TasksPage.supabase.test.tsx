import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TasksPage } from './TasksPage';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    errors: {} as Record<string, { message: string } | null>,
    inserts: [] as Array<{ table: string; payload: any }>,
    updates: [] as Array<{ table: string; payload: any; id: string }>,
    deletes: [] as Array<{ table: string; id: string }>,
  };

  const from = vi.fn((table: string) => {
    const builder: any = {
      select: () => builder,
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
      delete: () => ({
        eq: (_column: string, id: string) => {
          state.deletes.push({ table, id });
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
    currentUser: { id: 'user-1', first_name: 'Paul', last_name: 'BELL', email: 'dg@bell-mms.cm' },
    hasRole: (codes: string | string[]) =>
      (Array.isArray(codes) ? codes : [codes]).includes('directeur_general'),
    hasPermission: () => true,
    usersList: [],
  }),
}));

const TASKS = [
  {
    id: 'tsk-1',
    reference: 'TSK-2026-AAAAAAAA',
    title: 'Déposer le dossier de bornage au Cadastre',
    description: null,
    status: 'a_faire',
    priority: 'haute',
    due_date: '2026-11-20',
    assigned_to: 'user-2',
    assigned_to_name: 'Emmanuel FOTSO',
    client_id: null,
    created_by: 'user-1',
    created_by_name: 'Paul BELL',
    completed_at: null,
    notes: null,
    created_at: '2026-11-10T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
  },
];

const EVENTS = [
  {
    id: 'age-1',
    reference: 'AGR-2026-BBBBBBBB',
    title: 'Acte de vente notarié SCI Lobé',
    description: null,
    event_type: 'rdv_notaire',
    status: 'confirme',
    location: 'Bonanjo',
    starts_at: '2026-12-01T14:00:00Z',
    ends_at: '2026-12-01T15:00:00Z',
    assigned_to: 'user-1',
    assigned_to_name: 'Paul BELL',
    client_id: 'cli-1',
    created_by: 'user-3',
    created_by_name: 'Chantal NGO',
    notes: null,
    created_at: '2026-11-10T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
  },
];

const CLIENTS = [
  {
    id: 'cli-1',
    code: 'CLI-2026-002',
    client_type: 'entreprise',
    first_name: 'Suzanne',
    last_name: 'EPOUPA',
    company_name: 'SCI LOBE RESIDENCE',
    phone: '+237694556677',
    email: 'direction@scilobe.cm',
    address: 'Akwa',
    city: 'Douala',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
];

const PROFILES = [
  { id: 'user-1', first_name: 'Paul', last_name: 'BELL', email: 'dg@bell-mms.cm', is_active: true },
  { id: 'user-2', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'collab@bell-mms.cm', is_active: true },
];

beforeEach(() => {
  mockDb.state.tables = { tasks: TASKS, agenda_events: EVENTS, clients: CLIENTS, profiles: PROFILES };
  mockDb.state.errors = {};
  mockDb.state.inserts.length = 0;
  mockDb.state.updates.length = 0;
  mockDb.state.deletes.length = 0;
});

describe('TasksPage en mode connecté', () => {
  it('charge les tâches et l agenda depuis Supabase', async () => {
    render(<TasksPage />);

    expect(await screen.findByText('TSK-2026-AAAAAAAA')).toBeInTheDocument();
    expect(screen.getByText('Déposer le dossier de bornage au Cadastre')).toBeInTheDocument();
    expect(screen.getByText('Emmanuel FOTSO')).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agenda \(/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Agenda \(/ }));
    expect(await screen.findByText('AGR-2026-BBBBBBBB')).toBeInTheDocument();
    expect(screen.getByText('Acte de vente notarié SCI Lobé')).toBeInTheDocument();
    expect(screen.getByText(/Client : SCI LOBE RESIDENCE/)).toBeInTheDocument();
  });

  it('affiche une erreur explicite quand le chargement échoue', async () => {
    mockDb.state.errors = { tasks: { message: 'relation "public.tasks" does not exist' } };

    render(<TasksPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les tâches et l agenda depuis Supabase');
  });

  it('insère une tâche avec sa référence et son affecté', async () => {
    render(<TasksPage />);
    await screen.findByText('TSK-2026-AAAAAAAA');

    fireEvent.click(screen.getByRole('button', { name: /Nouvelle tâche/ }));
    fireEvent.change(screen.getByPlaceholderText('Déposer le dossier de bornage au Cadastre'), {
      target: { value: 'Préparer la réception des travaux de viabilisation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la tâche' }));

    await waitFor(() => expect(mockDb.state.inserts).toHaveLength(1));
    const [insert] = mockDb.state.inserts;
    expect(insert.table).toBe('tasks');
    expect(insert.payload).toMatchObject({
      title: 'Préparer la réception des travaux de viabilisation',
      status: 'a_faire',
      priority: 'normale',
      assigned_to: 'user-1',
      assigned_to_name: 'Paul BELL',
      created_by: 'user-1',
    });
    expect(insert.payload.reference).toMatch(/^TSK-\d{4}-[A-Z0-9]{8}$/);
  });

  it('met à jour le statut de la tâche dans la table tasks', async () => {
    render(<TasksPage />);
    await screen.findByText('TSK-2026-AAAAAAAA');

    fireEvent.click(screen.getByRole('button', { name: 'En cours' }));

    await waitFor(() => expect(mockDb.state.updates).toHaveLength(1));
    const [update] = mockDb.state.updates;
    expect(update.table).toBe('tasks');
    expect(update.id).toBe('tsk-1');
    expect(update.payload).toMatchObject({ status: 'en_cours', completed_at: null });
  });

  it('supprime une tâche uniquement pour la direction', async () => {
    render(<TasksPage />);
    await screen.findByText('TSK-2026-AAAAAAAA');

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer TSK-2026-AAAAAAAA' }));

    await waitFor(() => expect(mockDb.state.deletes).toHaveLength(1));
    expect(mockDb.state.deletes[0]).toMatchObject({ table: 'tasks', id: 'tsk-1' });
  });

  it('insère un événement agenda après contrôle du créneau', async () => {
    render(<TasksPage />);
    await screen.findByText('TSK-2026-AAAAAAAA');

    fireEvent.click(screen.getByRole('button', { name: /Agenda \(/ }));
    await screen.findByText('AGR-2026-BBBBBBBB');

    fireEvent.click(screen.getByRole('button', { name: /Nouvel événement/ }));
    fireEvent.change(screen.getByPlaceholderText('Visite de terrain — Japoma'), {
      target: { value: 'Visite PK21 avec le géomètre' },
    });
    fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-12-05T09:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-12-05T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l événement' }));

    await waitFor(() => expect(mockDb.state.inserts).toHaveLength(1));
    const [insert] = mockDb.state.inserts;
    expect(insert.table).toBe('agenda_events');
    expect(insert.payload).toMatchObject({ title: 'Visite PK21 avec le géomètre', event_type: 'visite_terrain' });
    expect(insert.payload.reference).toMatch(/^AGR-\d{4}-[A-Z0-9]{8}$/);
    expect(new Date(insert.payload.starts_at).getTime()).toBe(new Date('2026-12-05T09:00').getTime());
  });

  it('refuse un créneau dont la fin précède le début sans écrire en base', async () => {
    render(<TasksPage />);
    await screen.findByText('TSK-2026-AAAAAAAA');

    fireEvent.click(screen.getByRole('button', { name: /Agenda \(/ }));
    await screen.findByText('AGR-2026-BBBBBBBB');

    fireEvent.click(screen.getByRole('button', { name: /Nouvel événement/ }));
    fireEvent.change(screen.getByPlaceholderText('Visite de terrain — Japoma'), {
      target: { value: 'Créneau incohérent' },
    });
    fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-12-05T10:00' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-12-05T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l événement' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('La fin du créneau ne peut pas précéder son début.');
    expect(mockDb.state.inserts).toHaveLength(0);
  });
});
