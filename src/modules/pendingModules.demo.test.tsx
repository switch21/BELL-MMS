import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DGDashboard } from './dashboard/DGDashboard';
import { ServicesPage } from './services/ServicesPage';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-demo', first_name: 'Chantal', last_name: 'NGO', email: 'demo@bell-mms.local' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

describe('DGDashboard en mode démo', () => {
  it('conserve les données locales de démonstration', () => {
    render(
      <MemoryRouter>
        <DGDashboard />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: "Tableau de Bord Général — Direction" })
    ).toBeInTheDocument();
    expect(screen.getByText("Chiffre d'Affaires")).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();
  });
});

describe('ServicesPage en mode démo', () => {
  it('conserve les dossiers locaux de démonstration', () => {
    render(<ServicesPage />);

    expect(screen.getByText('MUT-2026-008')).toBeInTheDocument();
    expect(screen.getByText('Assistance Administrative & Prestations Foncières')).toBeInTheDocument();
  });
});
