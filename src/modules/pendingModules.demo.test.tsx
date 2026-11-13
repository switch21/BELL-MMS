import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DGDashboard } from './dashboard/DGDashboard';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
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
