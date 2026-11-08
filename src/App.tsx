import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

// Modules Phase 1
import { LoginPage } from './modules/auth/LoginPage';
import { DashboardRouter } from './modules/dashboard/DashboardRouter';
import { UsersPage } from './modules/users/UsersPage';
import { SettingsPage } from './modules/administration/SettingsPage';
import { AuditLogPage } from './modules/administration/AuditLogPage';

// Modules Phase 2 (Clients & Foncier)
import { ClientsPage } from './modules/clients/ClientsPage';
import { LandPage } from './modules/land/LandPage';

// Modules Phase 3 (Ventes & Terrains de Tiers)
import { SalesPage } from './modules/sales/SalesPage';
import { ThirdPartySalesPage } from './modules/sales/ThirdPartySalesPage';

// Modules Phase 4 (Prestations & Financement)
import { ServicesPage } from './modules/services/ServicesPage';
import { FinancingPage } from './modules/financing/FinancingPage';

// Modules Phase 5 (Finances & Trésorerie)
import { FinancePage } from './modules/finance/FinancePage';
import { FinancialReportsPage } from './modules/finance/FinancialReportsPage';

// Placeholders des phases suivantes
import { ModulePlaceholder } from './components/shared/ModulePlaceholder';
import { Building2, ShieldCheck, DollarSign, Calendar } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Route publique */}
              <Route path="/login" element={<LoginPage />} />

              {/* Routes protégées avec Layout principal */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                {/* Tableau de bord principal */}
                <Route path="/dashboard" element={<DashboardRouter />} />

                {/* Module Foncier & Cartographie (Phase 2) */}
                <Route
                  path="/land"
                  element={
                    <ProtectedRoute requiredPermission="land:read">
                      <LandPage />
                    </ProtectedRoute>
                  }
                />

                {/* Module Clients & Partenaires (Phase 2) */}
                <Route
                  path="/clients"
                  element={
                    <ProtectedRoute requiredPermission="clients:read">
                      <ClientsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Module Ventes & Réservations (Phase 3) */}
                <Route
                  path="/sales"
                  element={
                    <ProtectedRoute requiredPermission="sales:read">
                      <SalesPage />
                    </ProtectedRoute>
                  }
                />

                {/* Module Terrains de Tiers & Suivi Propriétaires (Phase 3) */}
                <Route
                  path="/third-party-land"
                  element={
                    <ProtectedRoute requiredPermission="sales:read">
                      <ThirdPartySalesPage />
                    </ProtectedRoute>
                  }
                />

                {/* Module Dossiers d'Assistance & Mutations (Phase 4) */}
                <Route
                  path="/services"
                  element={
                    <ProtectedRoute requiredPermission="services:read">
                      <ServicesPage />
                    </ProtectedRoute>
                  }
                />

                {/* Module Recherche de Financement (Phase 4) */}
                <Route
                  path="/financing"
                  element={
                    <ProtectedRoute requiredPermission="services:read">
                      <FinancingPage />
                    </ProtectedRoute>
                  }
                />

                {/* Administration & Droits (Phase 1) */}
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute requiredPermission="admin:users:manage">
                      <UsersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute requiredPermission="admin:settings:read">
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/audit"
                  element={
                    <ProtectedRoute requiredPermission="admin:audit:read">
                      <AuditLogPage />
                    </ProtectedRoute>
                  }
                />

                {/* Placeholders phasés pour les phases suivantes */}
                <Route
                  path="/projects"
                  element={
                    <ProtectedRoute requiredPermission="projects:manage">
                      <ModulePlaceholder
                        title="Travaux, Aménagement & Viabilisation"
                        phase="Phase 6"
                        description="Suivi technique des chantiers, engins, terrassiers et réceptions de travaux"
                        icon={Building2}
                        features={[
                          "Planification des travaux de viabilisation",
                          "Budgets prévisionnels et dépenses de chantier",
                          "Comptes rendus photographiques et réceptions",
                        ]}
                      />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/tenders"
                  element={
                    <ProtectedRoute requiredPermission="tenders:manage">
                      <ModulePlaceholder
                        title="Marchés Publics & Appels d'Offres"
                        phase="Phase 6"
                        description="Veille, candidatures, contrats, ordres de service et décomptes"
                        icon={ShieldCheck}
                        features={[
                          "Veille des appels d'offres au Cameroun",
                          "Constitution des pièces administratives et financières",
                          "Suivi des ordres de service et décomptes de facturation",
                        ]}
                      />
                    </ProtectedRoute>
                  }
                />

                {/* Module Finances & Trésorerie (Phase 5) */}
                <Route
                  path="/finance"
                  element={
                    <ProtectedRoute requiredPermission="finance:read">
                      <FinancePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/finance/reports"
                  element={
                    <ProtectedRoute requiredPermission="finance:reports:export">
                      <FinancialReportsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/tasks"
                  element={
                    <ProtectedRoute>
                      <ModulePlaceholder
                        title="Agenda, Tâches & Suivi des Collaborateurs"
                        phase="Phase 7"
                        description="Calendrier des visites, rendez-vous notariaux et alertes d'échéances"
                        icon={Calendar}
                        features={[
                          "Attribution des tâches avec priorité et échéance",
                          "Calendrier partagé de l'entreprise",
                          "Rappels et notifications d'alertes",
                        ]}
                      />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Redirections */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};
