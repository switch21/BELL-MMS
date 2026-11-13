import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DGDashboard } from './dashboard/DGDashboard';
import { SecretaryDashboard } from './dashboard/SecretaryDashboard';
import { CollaboratorDashboard } from './dashboard/CollaboratorDashboard';
import { AdminDashboard } from './dashboard/AdminDashboard';
import { ServicesPage } from './services/ServicesPage';
import { FinancePage } from './finance/FinancePage';
import { FinancialReportsPage } from './finance/FinancialReportsPage';
import { ThirdPartySalesPage } from './sales/ThirdPartySalesPage';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {},
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      id: 'user-test',
      full_name: 'Utilisateur Test',
      email: 'test@bell-mms.local',
      role: 'dg',
    },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

const MODULES = [
  { name: 'DG', element: <DGDashboard />, title: "Tableau de Bord Général — Direction" },
  { name: 'Secrétariat', element: <SecretaryDashboard />, title: "Tableau de Bord — Secrétariat & Accueil" },
  { name: 'Collaborateur', element: <CollaboratorDashboard />, title: "Mon Espace de Travail — Opérations" },
  { name: 'Administration', element: <AdminDashboard />, title: "Console d'Administration Système & Sécurité" },
  { name: 'Prestations', element: <ServicesPage />, title: "Assistance Administrative & Prestations Foncières" },
  { name: 'Trésorerie', element: <FinancePage />, title: "Gestion Financière, Caisses & Trésorerie" },
  { name: 'Rapports', element: <FinancialReportsPage />, title: "Rapports & Synthèse Financière Consolidée" },
  { name: 'Terrains de tiers', element: <ThirdPartySalesPage />, title: "Commercialisation Terrains de Tiers & Suivi Propriétaires" },
];

// Marqueurs propres aux jeux de démonstration localStorage : aucun ne doit fuiter en mode connecté.
const DEMO_MARKERS = [
  "Chiffre d'Affaires",
  '5 courriers',
  '6 dossiers',
  '4 comptes',
  'Trésorerie Totale Disponible',
  'MUT-2026-008',
  'DEP-2026-012',
  'REV-2026-001',
];

describe.each(MODULES)('$name en mode connecté', ({ element, title }) => {
  it('affiche un état explicite au lieu des données de démonstration', () => {
    render(<MemoryRouter>{element}</MemoryRouter>);

    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText('Module non raccordé à Supabase')).toBeInTheDocument();

    const text = document.body.textContent ?? '';
    for (const marker of DEMO_MARKERS) {
      expect(text).not.toContain(marker);
    }
  });
});
