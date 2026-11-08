import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, UserRoleCode } from '../types/auth.types';
import { 
  DEFAULT_ROLES, 
  getStoredData, 
  initLocalDatabase, 
  INITIAL_USERS, 
  logAuditEvent, 
  ROLE_PERMISSIONS_MAP, 
  setStoredData, 
  STORAGE_KEYS 
} from '../lib/storage';

interface AuthContextType {
  currentUser: UserProfile | null;
  currentRole: UserRoleCode | null;
  permissions: string[];
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permissionCode: string) => boolean;
  hasRole: (roleCode: UserRoleCode | UserRoleCode[]) => boolean;
  switchUser: (userId: string) => void;
  usersList: UserProfile[];
  refreshUserData: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);

  // Initialisation au montage
  useEffect(() => {
    initLocalDatabase();
    refreshUserData();

    // Récupérer l'utilisateur connecté sauvegardé
    const savedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    const users = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    
    if (savedUserId) {
      const found = users.find(u => u.id === savedUserId);
      if (found && found.is_active) {
        attachRoleInfo(found);
      } else {
        // Par défaut, connecter le Directeur Général
        attachRoleInfo(users[1]);
      }
    } else {
      // Premier démarrage : connecter le Directeur Général
      attachRoleInfo(users[1]);
    }

    setIsLoading(false);
  }, []);

  const refreshUserData = () => {
    const users = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    setUsersList(users);
  };

  const attachRoleInfo = (user: UserProfile) => {
    const roles = getStoredData(STORAGE_KEYS.ROLES, DEFAULT_ROLES);
    const role = roles.find(r => r.id === user.role_id);
    const userWithRole = { ...user, role };
    setCurrentUser(userWithRole);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, user.id);
  };

  // Résolution du code de rôle
  const currentRole: UserRoleCode | null = (currentUser?.role?.code as UserRoleCode) || null;

  // Calcul dynamique des permissions
  const permissions: string[] = currentRole ? (ROLE_PERMISSIONS_MAP[currentRole] || []) : [];

  const hasPermission = (permissionCode: string): boolean => {
    if (!currentUser || !currentUser.is_active) return false;
    // Le super administrateur possède l'ensemble des permissions système
    if (currentRole === 'super_admin') return true;
    return permissions.includes(permissionCode);
  };

  const hasRole = (roleCode: UserRoleCode | UserRoleCode[]): boolean => {
    if (!currentRole) return false;
    if (Array.isArray(roleCode)) {
      return roleCode.includes(currentRole);
    }
    return currentRole === roleCode;
  };

  const login = async (email: string, _password?: string): Promise<boolean> => {
    const users = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return false;
    }

    if (!user.is_active) {
      alert('Ce compte utilisateur a été désactivé par l\'administration.');
      return false;
    }

    attachRoleInfo(user);

    logAuditEvent({
      user_id: user.id,
      user_email: user.email,
      action: 'LOGIN',
      module: 'AUTH',
      entity_name: 'session',
      entity_id: user.id,
      old_values: null,
      new_values: { email: user.email, role: user.role_id, timestamp: new Date().toISOString() },
      ip_address: '127.0.0.1',
    });

    return true;
  };

  const logout = () => {
    if (currentUser) {
      logAuditEvent({
        user_id: currentUser.id,
        user_email: currentUser.email,
        action: 'UPDATE',
        module: 'AUTH',
        entity_name: 'session',
        entity_id: currentUser.id,
        old_values: { status: 'active' },
        new_values: { status: 'logged_out', timestamp: new Date().toISOString() },
        ip_address: '127.0.0.1',
      });
    }
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    setCurrentUser(null);
  };

  const switchUser = (userId: string) => {
    const users = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const user = users.find(u => u.id === userId);
    if (user && user.is_active) {
      attachRoleInfo(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        permissions,
        isLoading,
        login,
        logout,
        hasPermission,
        hasRole,
        switchUser,
        usersList,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
