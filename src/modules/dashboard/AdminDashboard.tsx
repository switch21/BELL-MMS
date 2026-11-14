import React, { useEffect, useState } from 'react';
import { Shield, Users, Database, Activity, Key, FileCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { AuditLogEntry, UserProfile, UserRole } from '../../types/auth.types';

type ProfileRow = UserProfile & { role?: { code: string; name: string } | null };

const AUDIT_ACTION_META: Record<
  string,
  { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'emerald' }
> = {
  CREATE: { label: 'Création', variant: 'success' },
  UPDATE: { label: 'Mise à jour', variant: 'info' },
  DELETE: { label: 'Suppression', variant: 'danger' },
  VALIDATE: { label: 'Validation', variant: 'emerald' },
  REJECT: { label: 'Rejet', variant: 'danger' },
  LOGIN: { label: 'Connexion', variant: 'neutral' },
};

export const AdminDashboard: React.FC = () => {
  if (isSupabaseConfigured) {
    return <ConnectedAdminDashboard />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Console d'Administration Système & Sécurité
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Supervision technique, gestion des privilèges, intégrité des migrations et audit trail
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/users">
            <Button variant="primary" size="sm" className="gap-1.5">
              <Users className="w-4 h-4" />
              Gérer les Comptes
            </Button>
          </Link>
          <Link to="/audit">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Activity className="w-4 h-4" />
              Journal d'Audit
            </Button>
          </Link>
        </div>
      </div>

      {/* Cartes Métriques Administrateur */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Utilisateurs Actifs
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-executive-emerald">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              4 comptes
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 font-medium">
              100% opérationnels
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Politiques RLS
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                <Shield className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              Actives
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Isolation stricte côté PostgreSQL
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Migrations Base
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              3 appliquées
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 font-medium">
              Schéma initial, RLS & Triggers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Journal d'Audit
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              Immuable
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Traçabilité des opérations sensibles
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rôles et architecture système */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Matrice des Rôles Officiels Définis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Directeur Général (directeur_general)</p>
                <p className="text-[11px] text-slate-500">Supervision intégrale, approbation dépenses, validation des ventes</p>
              </div>
              <Badge variant="emerald">1 utilisateur</Badge>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Secrétaire (secretaire)</p>
                <p className="text-[11px] text-slate-500">Coordination administrative, clients, courriers, réservations</p>
              </div>
              <Badge variant="emerald">1 utilisateur</Badge>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Collaborateur (collaborateur)</p>
                <p className="text-[11px] text-slate-500">Exécution dossiers affectés, tâches chantiers, demandes de dépenses</p>
              </div>
              <Badge variant="emerald">1 utilisateur</Badge>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Super Administrateur (super_admin)</p>
                <p className="text-[11px] text-slate-500">Maintenance technique, audit, paramètres généraux système</p>
              </div>
              <Badge variant="neutral">1 utilisateur</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Rappels de Conformité d'Architecture V1</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-executive-emerald shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 dark:text-white">Sécurité Côté Serveur :</strong> Aucune règle métier sensible (validation dépense, réservation parcelle) ne dépend du client. Toutes les contraintes sont contrôlées dans PostgreSQL / RLS.
              </div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-start gap-2.5">
              <Key className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 dark:text-white">Auto-Validation Interdite :</strong> Un demandeur de dépense ou de remboursement ne peut jamais approuver sa propre transaction.
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-100 dark:bg-executive-darkBg border border-slate-200 dark:border-executive-darkBorder flex items-start gap-2.5">
              <FileCode className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 dark:text-white">Devise Locale XAF :</strong> Tous les montants financiers sont typés <code>NUMERIC(15, 2)</code> en FCFA.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ConnectedAdminDashboard: React.FC = () => {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [weeklyAuditCount, setWeeklyAuditCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadAdminData = async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [profilesResult, rolesResult, auditResult, auditCountResult] = await Promise.all([
        supabase.from('profiles').select('*, role:roles(code, name)').order('last_name'),
        supabase.from('roles').select('*').order('name'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5),
        supabase
          .from('audit_logs')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo),
      ]);

      for (const result of [profilesResult, rolesResult, auditResult, auditCountResult]) {
        if (result.error) throw result.error;
      }
      if (!active) return;

      setProfiles((profilesResult.data ?? []) as ProfileRow[]);
      setRoles((rolesResult.data ?? []) as UserRole[]);
      setAuditLogs((auditResult.data ?? []) as AuditLogEntry[]);
      setWeeklyAuditCount(auditCountResult.count ?? 0);
    };

    loadAdminData()
      .catch((error: unknown) => {
        console.error("[Administration] Impossible de charger la console d'administration :", error);
        if (active) {
          setDataError(
            "Impossible de charger les comptes, rôles et journaux d'audit depuis Supabase. Vérifiez les migrations et vos droits."
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const activeProfiles = profiles.filter((profile) => profile.is_active);
  const inactiveCount = profiles.length - activeProfiles.length;

  const countByRole = (code: string) =>
    activeProfiles.filter((profile) => profile.role?.code === code).length;

  const superAdminCount = countByRole('super_admin');
  const directorCount = countByRole('directeur_general');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Console d'Administration Système & Sécurité
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Supervision technique, gestion des privilèges, intégrité des migrations et audit trail
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/users">
            <Button variant="primary" size="sm" className="gap-1.5">
              <Users className="w-4 h-4" />
              Gérer les Comptes
            </Button>
          </Link>
          <Link to="/audit">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Activity className="w-4 h-4" />
              Journal d'Audit
            </Button>
          </Link>
        </div>
      </div>

      {dataError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {dataError}
        </div>
      )}

      {isLoading && (
        <p role="status" className="text-xs text-slate-500 dark:text-executive-darkMuted">
          Chargement des comptes, rôles et journaux d'audit…
        </p>
      )}

      {/* Cartes Métriques Administrateur */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Utilisateurs Actifs
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-executive-emerald">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {activeProfiles.length} compte{activeProfiles.length > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 font-medium">
              {inactiveCount > 0
                ? `${inactiveCount} compte${inactiveCount > 1 ? 's' : ''} désactivé${inactiveCount > 1 ? 's' : ''}`
                : 'Tous les comptes sont actifs'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Super Administrateurs
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                <Shield className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {superAdminCount}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Accès technique total</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Direction Générale
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600">
                <Key className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {directorCount}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Comptes de supervision</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Événements d'Audit (7 j)
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {weeklyAuditCount}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Journal immuable côté PostgreSQL</p>
          </CardContent>
        </Card>
      </div>

      {/* Rôles réels et journal d'audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Répartition des Rôles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {roles.length === 0 && !isLoading && (
              <p className="text-xs text-slate-500 dark:text-executive-darkMuted">Aucun rôle défini.</p>
            )}
            {roles.map((role) => {
              const count = countByRole(role.code);
              return (
                <div
                  key={role.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {role.name} ({role.code})
                    </p>
                    <p className="text-[11px] text-slate-500">{role.description}</p>
                  </div>
                  <Badge variant={count > 0 ? 'emerald' : 'neutral'}>
                    {count} utilisateur{count > 1 ? 's' : ''}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Derniers Événements d'Audit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditLogs.length === 0 && !isLoading && (
              <p className="text-xs text-slate-500 dark:text-executive-darkMuted">Aucun événement enregistré.</p>
            )}
            {auditLogs.map((log) => {
              const meta = AUDIT_ACTION_META[log.action] ?? { label: log.action, variant: 'neutral' as const };
              return (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {log.entity_name} <span className="text-slate-400">· {log.module}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {log.user_email ?? 'Système'} · {formatDateTime(log.created_at)}
                    </p>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Rappels de conformité */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rappels de Conformité d'Architecture V1</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-executive-emerald shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-white">Sécurité Côté Serveur :</strong> Aucune règle métier sensible (validation dépense, réservation parcelle) ne dépend du client. Toutes les contraintes sont contrôlées dans PostgreSQL / RLS.
            </div>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-start gap-2.5">
            <Key className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-white">Auto-Validation Interdite :</strong> Un demandeur de dépense ou de remboursement ne peut jamais approuver sa propre transaction.
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-100 dark:bg-executive-darkBg border border-slate-200 dark:border-executive-darkBorder flex items-start gap-2.5">
            <Database className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-white">Devise Locale XAF :</strong> Tous les montants financiers sont typés <code>NUMERIC(15, 2)</code> en FCFA.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
