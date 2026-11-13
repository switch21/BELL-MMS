import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { INITIAL_USERS, setStoredData, STORAGE_KEYS } from '../lib/storage';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { auth: {} },
}));

let auth!: ReturnType<typeof useAuth>;

const Probe: React.FC = () => {
  auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="email">{auth.currentUser?.email ?? 'none'}</span>
      <span data-testid="role">{auth.currentRole ?? 'none'}</span>
    </div>
  );
};

const renderAuth = async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
};

describe('AuthContext — mode démo', () => {
  it('connecte le DG par défaut avec les permissions de son rôle', async () => {
    await renderAuth();

    expect(screen.getByTestId('email')).toHaveTextContent('dg@bell-mms.cm');
    expect(screen.getByTestId('role')).toHaveTextContent('directeur_general');
    expect(auth.hasPermission('sales:validate')).toBe(true);
    expect(auth.hasPermission('admin:users:manage')).toBe(false);
    expect(auth.hasPermission('permission:inexistante')).toBe(false);
  });

  it('authentifie la secrétaire et applique ses restrictions', async () => {
    await renderAuth();
    let result = false;

    await act(async () => {
      result = await auth.login('secretaire@bell-mms.cm');
    });

    expect(result).toBe(true);
    expect(auth.currentRole).toBe('secretaire');
    expect(auth.hasPermission('clients:write')).toBe(true);
    expect(auth.hasPermission('sales:validate')).toBe(false);
  });

  it('refuse un email inconnu sans changer l’utilisateur courant', async () => {
    await renderAuth();
    let result = true;

    await act(async () => {
      result = await auth.login('inconnu@bell-mms.cm');
    });

    expect(result).toBe(false);
    expect(auth.currentUser?.email).toBe('dg@bell-mms.cm');
  });

  it('refuse un compte désactivé', async () => {
    const users = INITIAL_USERS.map((user) =>
      user.email === 'secretaire@bell-mms.cm' ? { ...user, is_active: false } : user
    );
    setStoredData(STORAGE_KEYS.USERS, users);
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    await renderAuth();
    let result = true;

    await act(async () => {
      result = await auth.login('secretaire@bell-mms.cm');
    });

    expect(result).toBe(false);
    expect(window.alert).toHaveBeenCalled();
    expect(auth.currentUser?.email).toBe('dg@bell-mms.cm');
  });

  it('bascule d’utilisateur et accorde toutes les permissions au super admin', async () => {
    await renderAuth();

    act(() => auth.switchUser('user-admin-01'));
    expect(auth.currentRole).toBe('super_admin');
    expect(auth.hasPermission('admin:users:manage')).toBe(true);
    expect(auth.hasPermission('permission:inexistante')).toBe(true);

    act(() => auth.switchUser('user-collab-01'));
    expect(auth.currentRole).toBe('collaborateur');
    expect(auth.hasPermission('services:write')).toBe(true);
    expect(auth.hasPermission('finance:read')).toBe(false);
  });
});
