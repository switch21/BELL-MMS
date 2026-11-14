import React, { useEffect, useState } from 'react';
import { History, Search, Shield, Filter, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { AuditLogEntry } from '../../types/auth.types';
import { getStoredData, STORAGE_KEYS } from '../../lib/storage';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';

export const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, [])
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [dataError, setDataError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    const loadLogs = async () => {
      setIsLoading(true);
      setDataError(null);
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        if (active) setLogs((data ?? []) as AuditLogEntry[]);
      } catch (error) {
        console.error('[Supabase] Impossible de charger le journal d’audit :', error);
        if (active) {
          setDataError('Impossible de charger le journal d’audit depuis Supabase. Vérifiez la connexion et vos droits.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadLogs();
    return () => {
      active = false;
    };
  }, []);

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    return (
      log.user_email?.toLowerCase().includes(term) ||
      log.action.toLowerCase().includes(term) ||
      log.module.toLowerCase().includes(term) ||
      log.entity_name.toLowerCase().includes(term)
    );
  });

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'success';
      case 'UPDATE':
        return 'info';
      case 'DELETE':
        return 'danger';
      case 'VALIDATE':
        return 'emerald';
      case 'LOGIN':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Journal d'Audit & Traçabilité (Audit Trail)
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Historique immuable de toutes les actions, connexions et modifications sensibles
          </p>
        </div>
      </div>

      {dataError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {dataError}
        </div>
      )}
      {isLoading && (
        <p role="status" className="text-xs text-slate-500 dark:text-executive-darkMuted">
          Chargement du journal d’audit…
        </p>
      )}

      {/* Barre de recherche & filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par utilisateur, action, module ou entité..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-executive-darkBg border border-slate-200 dark:border-executive-darkBorder rounded-lg text-xs outline-none focus:ring-2 focus:ring-executive-emerald"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tableau des logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-executive-emerald" />
            Événements Enregistrés ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 dark:text-executive-darkMuted font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Date & Heure</th>
                  <th className="py-3 px-4">Utilisateur / Auteur</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Module</th>
                  <th className="py-3 px-4">Entité / Réf</th>
                  <th className="py-3 px-4 text-right">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Aucun événement d'audit ne correspond à vos critères.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors font-mono"
                    >
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                        {log.user_email || 'Système'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {log.action}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 uppercase text-[11px] text-slate-600 dark:text-slate-300">
                        {log.module}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {log.entity_name} {log.entity_id ? `(#${log.entity_id})` : ''}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          className="h-7 w-7 p-0"
                          title="Voir les valeurs modifiées"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modale de détails JSON */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="Détails de l'Événement d'Audit"
        description={`ID : ${selectedLog?.id} | Date : ${selectedLog ? formatDateTime(selectedLog.created_at) : ''}`}
        maxWidth="lg"
      >
        {selectedLog && (
          <div className="space-y-4 text-xs font-mono">
            <div>
              <p className="font-sans font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Informations Contextuelles :
              </p>
              <div className="p-3 rounded-lg bg-slate-100 dark:bg-executive-darkBg border border-slate-200 dark:border-executive-darkBorder space-y-1">
                <p>Auteur : <strong>{selectedLog.user_email}</strong> (ID: {selectedLog.user_id})</p>
                <p>Module : <strong>{selectedLog.module}</strong> | Entité : <strong>{selectedLog.entity_name}</strong></p>
                <p>Action : <strong>{selectedLog.action}</strong> | IP : {selectedLog.ip_address || 'Locale'}</p>
              </div>
            </div>

            {selectedLog.old_values && (
              <div>
                <p className="font-sans font-semibold text-rose-600 mb-1">
                  Valeurs Antérieures (Old Values) :
                </p>
                <pre className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 overflow-x-auto">
                  {JSON.stringify(selectedLog.old_values, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.new_values && (
              <div>
                <p className="font-sans font-semibold text-emerald-600 mb-1">
                  Nouvelles Valeurs (New Values) :
                </p>
                <pre className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200 overflow-x-auto">
                  {JSON.stringify(selectedLog.new_values, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
