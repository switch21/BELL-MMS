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
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
    if (!isSupabaseConfigured) initLocalDatabase();
    refreshUserData();

    if (isSupabaseConfigured) {
      // --- Mode Supabase : restaurer la session depuis Supabase Auth ---
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          fetchAndAttachSupabaseProfile(session.user.id).finally(() => setIsLoading(false));
        } else {
          setIsLoading(false);
        }
      });

      // Écouter les changements d'état d'authentification (refresh token, sign out externe, etc.)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          fetchAndAttachSupabaseProfile(session.user.id);
        } else {
          setCurrentUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // --- Mode fallback localStorage (dev / démo) ---
      const savedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      const users = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);

      if (savedUserId) {
        const found = users.find(u => u.id === savedUserId);
        if (found && found.is_active) {
          attachLocalRoleInfo(found);
        } else {
          // Par défaut, connecter le Directeur Général
          attachLocalRoleInfo(users[1]);
        }
      } else {
        // Premier démarrage : connecter le Directeur Général
        attachLocalRoleInfo(users[1]);
      }

      setIsLoading(false);
    }
  }, []);

  const refreshUserData = () => {
    if (isSupabaseConfigured) {
      setUsersList([]);
      return;
    }

    const users = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    setUsersList(users);
  };

  // Attache le rôle local et met à jour l'état (mode localStorage)
  const attachLocalRoleInfo = (user: UserProfile) => {
    const roles = getStoredData(STORAGE_KEYS.ROLES, DEFAULT_ROLES);
    const role = roles.find(r => r.id === user.role_id);
    const userWithRole = { ...user, role };
    setCurrentUser(userWithRole);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, user.id);
  };

  // Récupère le profil depuis la table `profiles` Supabase et met à jour l'état
  const fetchAndAttachSupabaseProfile = async (userId: string): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, role:roles(*)')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[Supabase] Erreur récupération profil :', error.message);
        setCurrentUser(null);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user || authData.user.id !== userId) {
        throw new Error('La session Supabase ne correspond pas au profil demandé.');
      }

      setCurrentUser({ ...data, email: authData.user.email ?? '' } as UserProfile);
    } catch (err) {
      console.error('[Supabase] Exception fetchAndAttachSupabaseProfile :', err);
      setCurrentUser(null);
    }
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

  const login = async (email: string, password?: string): Promise<boolean> => {
    if (isSupabaseConfigured) {
      if (!password) return false;

      // --- Mode Supabase : authentification réelle ---
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error || !data.user) {
          console.warn('[Supabase] Échec de connexion :', error?.message);
          // Relancer l'erreur avec le message Supabase pour l'affichage dans LoginPage
          throw new Error(error?.message || 'Identifiants invalides.');
        }

        await fetchAndAttachSupabaseProfile(data.user.id);

        logAuditEvent({
          user_id: data.user.id,
          user_email: data.user.email ?? email,
          action: 'LOGIN',
          module: 'AUTH',
          entity_name: 'session',
          entity_id: data.user.id,
          old_values: null,
          new_values: { email, timestamp: new Date().toISOString(), mode: 'supabase' },
          ip_address: '127.0.0.1',
        });

        return true;
      } catch (err) {
        // Propager l'erreur pour que LoginPage puisse l'afficher
        throw err;
      }
    }

    // --- Mode fallback localStorage (dev / démo, ou Supabase non configuré) ---
    const users = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return false;
    }

    if (!user.is_active) {
      alert('Ce compte utilisateur a été désactivé par l\'administration.');
      return false;
    }

    attachLocalRoleInfo(user);

    logAuditEvent({
      user_id: user.id,
      user_email: user.email,
      action: 'LOGIN',
      module: 'AUTH',
      entity_name: 'session',
      entity_id: user.id,
      old_values: null,
      new_values: { email: user.email, role: user.role_id, timestamp: new Date().toISOString(), mode: 'localStorage' },
      ip_address: '127.0.0.1',
    });

    return true;
  };

  const logout = async () => {
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

    if (isSupabaseConfigured) {
      // Déconnexion Supabase (invalide le token côté serveur)
      await supabase.auth.signOut();
    }

    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    setCurrentUser(null);
  };

  // switchUser reste en mode localStorage (utile pour le dev et la démo)
  const switchUser = (userId: string) => {
    if (isSupabaseConfigured) return;

    const users = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    const user = users.find(u => u.id === userId);
    if (user && user.is_active) {
      attachLocalRoleInfo(user);
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
