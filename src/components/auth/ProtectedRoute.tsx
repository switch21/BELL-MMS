import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRoleCode } from '../../types/auth.types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredRole?: UserRoleCode | UserRoleCode[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredRole,
}) => {
  const { currentUser, isLoading, hasPermission, hasRole, currentRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-executive-light dark:bg-executive-darkBg">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-executive-emerald border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-600 dark:text-executive-darkMuted">
            Chargement sécurisé de BELL-MMS...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Super admin a accès sans restriction
  if (currentRole === 'super_admin') {
    return <>{children}</>;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="p-8 text-center bg-white dark:bg-executive-darkSurface border border-red-200 dark:border-red-900 rounded-xl m-6">
        <h2 className="text-lg font-bold text-red-600 mb-2">Accès restreint</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Votre rôle actuel (<strong>{currentUser.role?.name}</strong>) ne dispose pas des privilèges nécessaires pour accéder à ce module.
        </p>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="p-8 text-center bg-white dark:bg-executive-darkSurface border border-amber-200 dark:border-amber-900 rounded-xl m-6">
        <h2 className="text-lg font-bold text-amber-600 mb-2">Permission manquante</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          La permission <code>{requiredPermission}</code> est requise pour cette opération.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
