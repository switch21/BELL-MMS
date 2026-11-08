import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRoleCode } from '../../types/auth.types';

interface PermissionGateProps {
  permission?: string;
  role?: UserRoleCode | UserRoleCode[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  role,
  fallback = null,
  children,
}) => {
  const { hasPermission, hasRole, currentRole } = useAuth();

  // Super Admin a toujours accès
  if (currentRole === 'super_admin') {
    return <>{children}</>;
  }

  if (role && !hasRole(role)) {
    return <>{fallback}</>;
  }

  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
