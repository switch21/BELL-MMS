import React from 'react';
import { Sun, Moon, LogOut, Bell, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../ui/Button';

export const Topbar: React.FC = () => {
  const { currentUser, currentRole, logout, switchUser, usersList } = useAuth();
  const { effectiveTheme, toggleTheme } = useTheme();

  return (
    <header className="h-16 bg-white dark:bg-executive-darkSurface border-b border-slate-200 dark:border-executive-darkBorder px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs">
      {/* Salutation / Contextualisation */}
      <div className="flex items-center gap-3">
        <div>
          <span className="text-xs text-slate-500 dark:text-executive-darkMuted font-medium">
            Session active :
          </span>{' '}
          <strong className="text-sm font-semibold text-slate-900 dark:text-executive-darkText">
            {currentUser?.first_name} {currentUser?.last_name}
          </strong>{' '}
          <span className="text-xs text-executive-emerald dark:text-emerald-400 font-medium">
            ({currentUser?.job_title})
          </span>
        </div>
      </div>

      {/* Actions & Raccourcis de droite */}
      <div className="flex items-center gap-3">
        {/* Sélecteur rapide de rôle (Mode bac à sable / validation rapide de chaque persona) */}
        <div className="hidden md:flex items-center gap-2 bg-slate-100 dark:bg-executive-darkBg py-1 px-2.5 rounded-lg border border-slate-200 dark:border-executive-darkBorder text-xs">
          <UserCheck className="w-3.5 h-3.5 text-executive-emerald" />
          <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">
            Changer de profil :
          </span>
          <select
            value={currentUser?.id}
            onChange={(e) => switchUser(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-800 dark:text-executive-darkText outline-none cursor-pointer"
          >
            {usersList.map((u) => (
              <option key={u.id} value={u.id} className="dark:bg-slate-900">
                {u.first_name} ({u.job_title})
              </option>
            ))}
          </select>
        </div>

        {/* Basculeur de thème Clair / Sombre */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleTheme}
          className="p-2 h-9 w-9 rounded-lg"
          title={`Activer le mode ${effectiveTheme === 'light' ? 'sombre' : 'clair'}`}
        >
          {effectiveTheme === 'light' ? (
            <Moon className="w-4 h-4 text-slate-700" />
          ) : (
            <Sun className="w-4 h-4 text-amber-400" />
          )}
        </Button>

        {/* Notifications */}
        <Button
          variant="outline"
          size="sm"
          className="p-2 h-9 w-9 rounded-lg relative"
          title="Notifications internes"
        >
          <Bell className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-executive-emerald rounded-full"></span>
        </Button>

        {/* Déconnexion */}
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-slate-600 dark:text-executive-darkMuted hover:text-red-600 dark:hover:text-red-400 gap-1.5 text-xs font-semibold"
          title="Se déconnecter"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Déconnexion</span>
        </Button>
      </div>
    </header>
  );
};
