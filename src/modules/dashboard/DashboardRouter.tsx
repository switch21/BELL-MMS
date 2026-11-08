import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { DGDashboard } from './DGDashboard';
import { SecretaryDashboard } from './SecretaryDashboard';
import { CollaboratorDashboard } from './CollaboratorDashboard';
import { AdminDashboard } from './AdminDashboard';

export const DashboardRouter: React.FC = () => {
  const { currentRole } = useAuth();

  switch (currentRole) {
    case 'directeur_general':
      return <DGDashboard />;
    case 'secretaire':
      return <SecretaryDashboard />;
    case 'collaborateur':
      return <CollaboratorDashboard />;
    case 'super_admin':
      return <AdminDashboard />;
    default:
      return <CollaboratorDashboard />;
  }
};
