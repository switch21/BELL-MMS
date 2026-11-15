import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TasksPage } from './TasksPage';
import { getStoredData, INITIAL_TASKS, STORAGE_KEYS } from '../../lib/storage';

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

const auth = vi.hoisted(() => ({
  currentUser: { id: 'user-sec-01', first_name: 'Chantal', last_name: 'NGO', email: 'secretaire@bell-mms.cm' },
  permissions: [] as string[],
  roles: ['secretaire'] as string[],
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: auth.currentUser,
    hasRole: (codes: string | string[]) =>
      (Array.isArray(codes) ? codes : [codes]).some((code) => auth.roles.includes(code)),
    hasPermission: (code: string) => auth.permissions.includes(code),
    usersList: [
      { id: 'user-sec-01', first_name: 'Chantal', last_name: 'NGO', email: 'secretaire@bell-mms.cm' },
      { id: 'user-collab-01', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'collaborateur@bell-mms.cm' },
    ],
  }),
}));

beforeEach(() => {
  localStorage.clear();
  auth.permissions = ['tasks:manage', 'agenda:manage'];
  auth.roles = ['secretaire'];
});

describe('TasksPage en mode démo', () => {
  it('affiche les tâches et l agenda locaux', () => {
    render(<TasksPage />);

    expect(screen.getByText('TSK-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Déposer le dossier de bornage au Cadastre (PK21)')).toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Agenda \(/ }));
    expect(screen.getByText('AGR-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Visite de terrain — Lotissement La Grâce Japoma')).toBeInTheDocument();
  });

  it('enregistre une tâche créée dans le dépôt local', () => {
    render(<TasksPage />);

    fireEvent.click(screen.getByRole('button', { name: /Nouvelle tâche/ }));
    fireEvent.change(screen.getByPlaceholderText('Déposer le dossier de bornage au Cadastre'), {
      target: { value: 'Contacter le notaire pour la marge' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la tâche' }));

    const stored = getStoredData<Array<{ title: string }>>(STORAGE_KEYS.TASKS, []);
    expect(stored).toHaveLength(INITIAL_TASKS.length + 1);
    expect(stored[0].title).toBe('Contacter le notaire pour la marge');
  });

  it('reste en lecture seule sans les droits de gestion', () => {
    auth.permissions = [];

    render(<TasksPage />);

    expect(screen.getByText('TSK-2026-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nouvelle tâche/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'En cours' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/la saisie est réservée aux habilités/)
    ).toBeInTheDocument();
  });

  it('reserve la suppression a la direction', () => {
    auth.roles = ['collaborateur'];

    render(<TasksPage />);

    expect(screen.getByText('TSK-2026-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer TSK-2026-001' })).not.toBeInTheDocument();
  });

  it('permet la suppression au directeur general', () => {
    auth.roles = ['directeur_general'];

    render(<TasksPage />);

    expect(screen.getByRole('button', { name: 'Supprimer TSK-2026-001' })).toBeInTheDocument();
  });
});
