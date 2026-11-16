import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectsPage } from './ProjectsPage';
import {
  getStoredData,
  INITIAL_WORK_PROJECTS,
  STORAGE_KEYS,
} from '../../lib/storage';
import type { WorkProject } from '../../types/project.types';

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

const auth = vi.hoisted(() => ({
  currentUser: { id: 'user-sec-01', first_name: 'Chantal', last_name: 'NGO', email: 'secretaire@bell-mms.cm' },
  permissions: [] as string[],
  roles: [] as string[],
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
  auth.permissions = ['projects:manage'];
  auth.roles = ['secretaire'];
});

describe('ProjectsPage en mode démo', () => {
  it("affiche les chantiers locaux et leur canevas d'étapes", () => {
    render(<ProjectsPage />);

    expect(screen.getByText('TRV-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Viabilisation du lotissement La Grâce Japoma')).toBeInTheDocument();
    expect(screen.getByText('2/5 étapes faites')).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Suivre/ })[0]);
    expect(screen.getByText('Ouverture de piste et terrassement')).toBeInTheDocument();
    expect(screen.getByText('Réception de travaux et PV')).toBeInTheDocument();
  });

  it('enregistre un chantier créé dans le dépôt local avec ses cinq étapes', () => {
    render(<ProjectsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir un chantier/ }));
    fireEvent.change(screen.getByPlaceholderText('Viabilisation du lotissement La Grâce Japoma'), {
      target: { value: 'Drainage de la voirie Akwa Nord' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer et générer les étapes/ }));

    const stored = getStoredData<WorkProject[]>(STORAGE_KEYS.WORK_PROJECTS, []);
    expect(stored).toHaveLength(INITIAL_WORK_PROJECTS.length + 1);
    expect(stored[0].title).toBe('Drainage de la voirie Akwa Nord');
    expect(stored[0].reference).toMatch(/^TRV-\d{4}-[A-Z0-9]{8}$/);
    expect(stored[0].steps).toHaveLength(5);
    expect(stored[0].steps?.[0]).toMatchObject({ step_order: 1, status: 'en_cours', project_id: stored[0].id });

    const audit = getStoredData<Array<{ action: string; entity_name: string }>>(STORAGE_KEYS.AUDIT_LOGS, []);
    expect(audit[0]).toMatchObject({ action: 'CREATE', entity_name: 'work_projects' });
  });

  it('clôture une étape et en ouvre la suivante dans le dépôt local', () => {
    render(<ProjectsPage />);

    fireEvent.click(screen.getAllByRole('button', { name: /Suivre/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: "Clôturer l'étape 3" }));

    expect(screen.getByText('3/5 étapes faites')).toBeInTheDocument();
    const stored = getStoredData<WorkProject[]>(STORAGE_KEYS.WORK_PROJECTS, []);
    const project = stored.find((item) => item.id === 'wrk-01');
    expect(project?.steps?.[2]).toMatchObject({ status: 'termine', completed_by_name: 'Chantal NGO' });
    expect(project?.steps?.[3]).toMatchObject({ status: 'en_cours' });
  });

  it("restreint l'affichage aux chantiers du collaborateur connecté", () => {
    render(<ProjectsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Mes chantiers/ }));

    expect(screen.getByText('TRV-2026-0003')).toBeInTheDocument();
    expect(screen.queryByText('TRV-2026-0001')).not.toBeInTheDocument();
  });

  it("refuse l'ouverture d'un chantier sans le droit projects:manage", () => {
    auth.permissions = [];

    render(<ProjectsPage />);

    expect(screen.queryByRole('button', { name: /Ouvrir un chantier/ })).not.toBeInTheDocument();
    expect(screen.getByText(/réservées aux porteurs du droit/)).toBeInTheDocument();
    expect(screen.getByText('TRV-2026-0001')).toBeInTheDocument();
  });
});
