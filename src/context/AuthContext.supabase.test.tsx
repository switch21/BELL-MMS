import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

const mock = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ fn: string; args?: unknown }>,
  rpcError: null as { message: string } | null,
  signInError: null as { message: string } | null,
  profile: {
    id: 'u-dg',
    first_name: 'Emmanuel',
    last_name: 'FOTSO',
    email: null,
    role_id: 'role-dg',
    is_active: true,
    role: { id: 'role-dg', code: 'directeur_general', name: 'Directeur Général' },
  } as Record<string, unknown>,
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async ({ email }: { email: string }) => {
        if (mock.signInError) {
          return { data: { user: null }, error: mock.signInError };
        }
        return { data: { user: { id: 'u-dg', email } }, error: null };
      },
      getUser: async () => ({
        data: { user: { id: 'u-dg', email: 'dg@bell-mms.cm' } },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mock.profile, error: null }),
        }),
      }),
    }),
    rpc: async (fn: string, args?: unknown) => {
      mock.rpcCalls.push({ fn, args });
      return { data: 'log-1', error: mock.rpcError };
    },
  },
}));

let auth!: ReturnType<typeof useAuth>;

const Probe: React.FC = () => {
  auth = useAuth();
  return <span data-testid="email">{auth.currentUser?.email ?? 'none'}</span>;
};

const renderAuth = async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(auth.isLoading).toBe(false));
};

beforeEach(() => {
  mock.rpcCalls = [];
  mock.rpcError = null;
  mock.signInError = null;
});

describe('AuthContext en mode connecté', () => {
  it('journalise la connexion via la RPC log_login_event', async () => {
    await renderAuth();
    let result = false;

    await act(async () => {
      result = await auth.login('dg@bell-mms.cm', 'motdepasse123');
    });

    expect(result).toBe(true);
    expect(auth.currentUser?.email).toBe('dg@bell-mms.cm');
    expect(mock.rpcCalls).toEqual([{ fn: 'log_login_event', args: undefined }]);
  });

  it('ne bloque pas la connexion si la journalisation échoue', async () => {
    mock.rpcError = { message: 'permission denied for function log_login_event' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await renderAuth();
    let result = false;

    await act(async () => {
      result = await auth.login('dg@bell-mms.cm', 'motdepasse123');
    });

    expect(result).toBe(true);
    expect(mock.rpcCalls).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Journalisation de connexion indisponible'),
      mock.rpcError.message
    );
    warn.mockRestore();
  });

  it('ne journalise rien quand l’authentification échoue', async () => {
    mock.signInError = { message: 'Invalid login credentials' };

    await renderAuth();

    await act(async () => {
      await expect(auth.login('dg@bell-mms.cm', 'mauvais')).rejects.toThrow(
        'Invalid login credentials'
      );
    });

    expect(mock.rpcCalls).toHaveLength(0);
  });
});
