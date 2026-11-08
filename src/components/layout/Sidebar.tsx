import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Building2,
  Users,
  FileText,
  DollarSign,
  Briefcase,
  ShieldCheck,
  History,
  Settings,
  Calendar,
  Layers,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/Badge';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  permission?: string;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { hasPermission, currentUser, currentRole } = useAuth();

  const sections: NavSection[] = [
    {
      title: 'Pilotage & Général',
      items: [
        { name: 'Tableau de bord', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Agenda & Tâches', path: '/tasks', icon: Calendar },
      ],
    },
    {
      title: 'Foncier & Commercial',
      items: [
        { name: 'Patrimoine Foncier', path: '/land', icon: MapPin, permission: 'land:read' },
        { name: 'Réservations & Ventes', path: '/sales', icon: TrendingUp, permission: 'sales:read' },
        { name: 'Terrains de Tiers', path: '/third-party-land', icon: Layers, permission: 'sales:read' },
        { name: 'Clients & Partenaires', path: '/clients', icon: Users, permission: 'clients:read' },
      ],
    },
    {
      title: 'Dossiers & Projets',
      items: [
        { name: 'Assistance & Mutations', path: '/services', icon: FileText, permission: 'services:read' },
        { name: 'Recherche de Financement', path: '/financing', icon: Briefcase, permission: 'services:read' },
        { name: 'Travaux & Viabilisation', path: '/projects', icon: Building2, permission: 'projects:manage' },
        { name: 'Marchés Publics', path: '/tenders', icon: ShieldCheck, permission: 'tenders:manage' },
      ],
    },
    {
      title: 'Finances & Trésorerie',
      items: [
        { name: 'Trésorerie & Caisses', path: '/finance', icon: DollarSign, permission: 'finance:read' },
        { name: 'Rapports Financiers', path: '/finance/reports', icon: TrendingUp, permission: 'finance:reports:export' },
      ],
    },
    {
      title: 'Administration',
      items: [
        { name: 'Utilisateurs & Droits', path: '/users', icon: Users, permission: 'admin:users:manage' },
        { name: 'Paramètres Généraux', path: '/settings', icon: Settings, permission: 'admin:settings:read' },
        { name: 'Journal d\'Audit', path: '/audit', icon: History, permission: 'admin:audit:read' },
      ],
    },
  ];

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Administrateur',
    directeur_general: 'Directeur Général',
    secretaire: 'Secrétaire',
    collaborateur: 'Collaborateur',
  };

  return (
    <aside className="w-64 bg-executive-dark text-white flex flex-col shrink-0 h-screen sticky top-0 border-r border-executive-dark/50 select-none shadow-xl z-30">
      {/* Brand Header */}
      <div className="p-5 border-b border-white/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-executive-emerald flex items-center justify-center font-bold text-white shadow-inner tracking-wider">
          BM
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide text-white leading-tight">
            BELL-MMS
          </h1>
          <p className="text-[10px] text-executive-soft uppercase tracking-wider font-semibold">
            Gestion d'Entreprise
          </p>
        </div>
      </div>

      {/* Profil rapide utilisateur */}
      <div className="px-5 py-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="truncate">
          <p className="text-xs font-semibold text-white truncate">
            {currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Utilisateur'}
          </p>
          <span className="text-[10px] text-executive-soft font-medium">
            {currentRole ? roleLabels[currentRole] || currentRole : 'Rôle non défini'}
          </span>
        </div>
        <Badge variant="emerald" size="sm" className="bg-executive-emerald/30 text-emerald-200 border-none text-[9px]">
          Actif
        </Badge>
      </div>

      {/* Navigation Scrollable */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 text-sm custom-scrollbar">
        {sections.map((section) => {
          // Filtrer les éléments selon les permissions
          const visibleItems = section.items.filter((item) => {
            if (!item.permission) return true;
            return hasPermission(item.permission);
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <h2 className="px-3 text-[11px] font-bold uppercase tracking-wider text-executive-soft/70 mb-2">
                {section.title}
              </h2>
              <ul className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center justify-between px-3 py-2 rounded-lg font-medium text-xs transition-colors group",
                            isActive
                              ? "bg-executive-emerald text-white shadow-sm"
                              : "text-slate-300 hover:bg-white/10 hover:text-white"
                          )
                        }
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className="w-4 h-4 shrink-0 text-executive-soft group-hover:text-white transition-colors" />
                          <span className="truncate">{item.name}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Footer info Cameroun */}
      <div className="p-4 border-t border-white/10 text-center text-[10px] text-executive-soft/80 bg-black/20">
        <p className="font-semibold text-white/90">BELL ENTERPRISE — CAMEROUN</p>
        <p className="mt-0.5">Devise : XAF (FCFA) | V1.0</p>
      </div>
    </aside>
  );
};
