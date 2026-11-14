import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UsersPage } from './users/UsersPage';
import { AuditLogPage } from './administration/AuditLogPage';
import { logAuditEvent, STORAGE_KEYS } from '../lib/storage';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    errors: {} as Record<string, { message: string } | null>,
    updates: [] as Array<{ table: string; payload: any }>,
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
    builder.order = record('order');
    builder.limit = record('limit');
    builder.update = (payload: any) => {
      state.updates.push({ table, payload });
      state.queries.push({ table, method: 'update', args: [payload] });
      return builder;
    };

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
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));

  return { state, from, rpc };
});

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mockDb.from, rpc: mockDb.rpc },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'u-admin', first_name: 'Chantal', last_name: 'NGO', email: 'admin@bell-mms.local' },
    usersList: [],
    refreshUserData: () => {},
  }),
}));

const PROFILES = [
  {
    id: 'u1',
    first_name: 'Emmanuel',
    last_name: 'FOTSO',
    email: 'dg@bell-mms.local',
    phone: '+237 699000001',
    job_title: 'Directeur Général',
    role_id: 'role-dg',
    role: { id: 'role-dg', code: 'directeur_general', name: 'Directeur Général' },
    is_active: true,
    theme_preference: 'light',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'u2',
    first_name: 'Paul',
    last_name: 'NGUE',
    email: 'collab@bell-mms.local',
    phone: '+237 699000002',
    job_title: 'Géomètre',
    role_id: 'role-collab',
    role: { id: 'role-collab', code: 'collaborateur', name: 'Collaborateur' },
    is_active: false,
    theme_preference: 'light',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const ROLES = [
  { id: 'role-dg', code: 'directeur_general', name: 'Directeur Général', description: 'Supervision intégrale', is_system: true },
  { id: 'role-collab', code: 'collaborateur', name: 'Collaborateur', description: 'Exécution opérationnelle', is_system: true },
  { id: 'role-super', code: 'super_admin', name: 'Super Administrateur', description: 'Maintenance technique', is_system: true },
];

const AUDIT_LOGS = [
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
    created_at: '2026-11-13T09:00:00Z',
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
    created_at: '2026-11-12T09:00:00Z',
  },
];

beforeEach(() => {
  mockDb.state.tables = {};
  mockDb.state.errors = {};
  mockDb.state.updates = [];
  mockDb.state.queries = [];
  localStorage.clear();
});

describe('UsersPage en mode connecté', () => {
  it('charge les profils et les rôles depuis Supabase', async () => {
    mockDb.state.tables = { profiles: PROFILES, roles: ROLES };

    render(<UsersPage />);

    expect(await screen.findByText('Emmanuel FOTSO')).toBeInTheDocument();
    expect(screen.getByText('Paul NGUE')).toBeInTheDocument();
    expect(screen.getAllByText('Directeur Général').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Collaborateur').length).toBeGreaterThan(0);

    expect(mockDb.state.queries).toContainEqual({
      table: 'profiles',
      method: 'select',
      args: ['*, role:roles(*)'],
    });
    expect(mockDb.state.queries).toContainEqual({
      table: 'roles',
      method: 'select',
      args: ['*'],
    });
    expect(screen.queryByText('Aucun profil utilisateur disponible.')).not.toBeInTheDocument();
  });

  it('enregistre les modifications de profil sans toucher à l’email', async () => {
    mockDb.state.tables = { profiles: PROFILES, roles: ROLES };

    render(<UsersPage />);
    await screen.findByText('Emmanuel FOTSO');

    fireEvent.click(screen.getAllByTitle('Modifier les droits')[0]);

    fireEvent.change(screen.getByLabelText('Téléphone (Cameroun)'), {
      target: { value: '+237 699111222' },
    });
    fireEvent.click(screen.getByLabelText(/Compte actif/));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/ }));

    await waitFor(() => expect(mockDb.state.updates).toHaveLength(1));

    expect(mockDb.state.updates[0].table).toBe('profiles');
    expect(mockDb.state.updates[0].payload).toMatchObject({
      first_name: 'Emmanuel',
      last_name: 'FOTSO',
      phone: '+237 699111222',
      job_title: 'Directeur Général',
      role_id: 'role-dg',
      is_active: false,
    });
    expect(mockDb.state.updates[0].payload.email).toBeUndefined();
    expect(mockDb.state.queries).toContainEqual({
      table: 'profiles',
      method: 'eq',
      args: ['id', 'u1'],
    });
  });

  it('affiche une erreur de chargement et désactive la création de compte', async () => {
    mockDb.state.tables = { profiles: [], roles: [] };
    mockDb.state.errors = { profiles: { message: 'permission denied' } };

    render(<UsersPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger les utilisateurs depuis Supabase'
    );
    expect(screen.getByRole('button', { name: /Ajouter un Collaborateur/ })).toBeDisabled();
    expect(screen.getByText(/Edge Function/)).toBeInTheDocument();
  });
});

describe('AuditLogPage en mode connecté', () => {
  it('lit audit_logs et ignore les entrées locales', async () => {
    localStorage.setItem(
      STORAGE_KEYS.AUDIT_LOGS,
      JSON.stringify([
        {
          id: 'local-1',
          user_id: null,
          user_email: 'local@bell-mms.local',
          action: 'LOGIN',
          module: 'LOCAL-ONLY',
          entity_name: 'session',
          entity_id: 'local',
          old_values: null,
          new_values: null,
          created_at: '2026-11-14T09:00:00Z',
        },
      ])
    );
    mockDb.state.tables = { audit_logs: AUDIT_LOGS };

    render(<AuditLogPage />);

    expect(screen.queryByText('LOCAL-ONLY')).not.toBeInTheDocument();

    expect(await screen.findByText('FINANCE')).toBeInTheDocument();
    expect(screen.getByText('LAND')).toBeInTheDocument();
    expect(screen.getByText('dg@bell-mms.local')).toBeInTheDocument();
    expect(screen.getByText('Système')).toBeInTheDocument();
    expect(screen.queryByText('LOCAL-ONLY')).not.toBeInTheDocument();
    expect(screen.queryByText('local@bell-mms.local')).not.toBeInTheDocument();

    expect(mockDb.state.queries).toContainEqual({
      table: 'audit_logs',
      method: 'order',
      args: ['created_at', { ascending: false }],
    });
    expect(mockDb.state.queries).toContainEqual({
      table: 'audit_logs',
      method: 'limit',
      args: [500],
    });
  });

  it('affiche une erreur explicite quand la lecture échoue', async () => {
    mockDb.state.tables = { audit_logs: [] };
    mockDb.state.errors = { audit_logs: { message: 'permission denied' } };

    render(<AuditLogPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger le journal d’audit depuis Supabase'
    );
  });
});

describe('logAuditEvent en mode connecté', () => {
  it('ne pollue pas le stockage local', () => {
    logAuditEvent({
      user_id: 'u1',
      user_email: 'dg@bell-mms.local',
      action: 'LOGIN',
      module: 'AUTH',
      entity_name: 'session',
      entity_id: 'u1',
      old_values: null,
      new_values: null,
    });

    expect(localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)).toBeNull();
  });
});
