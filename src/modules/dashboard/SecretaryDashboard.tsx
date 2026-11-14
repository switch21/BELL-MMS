import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Mail, Calendar, Clock, PlusCircle, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Client } from '../../types/land.types';
import { Receipt, Reservation } from '../../types/sales.types';
import { ServiceCase } from '../../types/services.types';

type ServiceCaseRow = ServiceCase & {
  client?: { first_name?: string | null; last_name?: string | null; company_name?: string | null } | null;
};

type ReservationRow = Reservation & {
  client?: { first_name?: string | null; last_name?: string | null; company_name?: string | null } | null;
  plot?: { plot_number: string } | null;
};

const CASE_STATUS_META: Record<
  string,
  { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }
> = {
  creation: { label: 'Créé', variant: 'neutral' },
  pieces_en_cours: { label: 'Pièces en cours', variant: 'info' },
  instruction_cadastre: { label: 'Instruction cadastre', variant: 'warning' },
  soumis_validation_dg: { label: 'Soumis DG', variant: 'info' },
  approuve_dg: { label: 'Approuvé DG', variant: 'success' },
  rejete_dg: { label: 'Rejeté DG', variant: 'danger' },
  cloture: { label: 'Clôturé', variant: 'neutral' },
};

const PREPARATION_STATUSES = ['creation', 'pieces_en_cours', 'instruction_cadastre'];

const clientLabel = (client: ReservationRow['client'] | ServiceCaseRow['client']): string => {
  if (!client) return 'Client non renseigné';
  const name = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim();
  return client.company_name || name || 'Client non renseigné';
};

const daysUntil = (dateString: string): number => {
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

const localTodayIso = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export const SecretaryDashboard: React.FC = () => {
  if (isSupabaseConfigured) {
    return <ConnectedSecretaryDashboard />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Tableau de Bord — Secrétariat & Accueil
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Gestion du courrier, accueil clients, planification et coordination administrative
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" className="gap-1.5">
            <PlusCircle className="w-4 h-4" />
            Nouveau Dossier Client
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Mail className="w-4 h-4" />
            Enregistrer un Courrier
          </Button>
        </div>
      </div>

      {/* Cartes KPI Secrétaire */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Courriers à Traiter
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-executive-emerald">
                <Mail className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              5 courriers
            </div>
            <p className="mt-1 text-[11px] text-amber-600 font-medium">
              2 courriers urgents (Cadastre Douala 5ème)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Dossiers en Préparation
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              8 dossiers
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              3 mutations, 2 jugements d'hérédité
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Rendez-vous du Jour
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              4 rendez-vous
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 font-medium">
              Prochain à 11h00 (Visite terrain Kotto)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Reçus à Émettre
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              2 reçus
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Versements échelonnés reçus ce matin
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Listes opérationnelles Secrétariat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Rendez-vous & Visites de Terrains</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  M. Kamdem (Prospect Terrain Lobe)
                </p>
                <p className="text-[11px] text-slate-500">Accompagnateur : Emmanuel FOTSO</p>
              </div>
              <Badge variant="emerald">11h00</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Maitre Mbianda (Notaire — Signature dossier mutation)
                </p>
                <p className="text-[11px] text-slate-500">Direction Générale</p>
              </div>
              <Badge variant="emerald">15h30</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Courriers Arrivés Récents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg border border-slate-100 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg space-y-1">
              <div className="flex justify-between">
                <span className="text-[10px] font-semibold text-executive-emerald">
                  REF: ARR-2026-11-042
                </span>
                <span className="text-[10px] text-slate-400">Hier à 16:30</span>
              </div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Délégation Régionale du Cadastre du Littoral
              </p>
              <p className="text-[11px] text-slate-500">
                Notification de bornage contradictoire - Lotissement Yassa
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ConnectedSecretaryDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [cases, setCases] = useState<ServiceCaseRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [todayReceipts, setTodayReceipts] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const [casesResult, reservationsResult, receiptsResult, clientsResult] = await Promise.all([
        supabase
          .from('service_cases')
          .select('*, client:clients(first_name, last_name, company_name)')
          .in('status', PREPARATION_STATUSES)
          .order('opened_date', { ascending: false }),
        supabase
          .from('reservations')
          .select('*, client:clients(first_name, last_name, company_name), plot:plots(plot_number)')
          .eq('status', 'active')
          .order('expiration_date', { ascending: true }),
        supabase
          .from('receipts')
          .select('*')
          .eq('payment_date', localTodayIso())
          .order('created_at', { ascending: false }),
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
      ]);

      for (const result of [casesResult, reservationsResult, receiptsResult, clientsResult]) {
        if (result.error) throw result.error;
      }
      if (!active) return;

      setCases((casesResult.data ?? []) as ServiceCaseRow[]);
      setReservations((reservationsResult.data ?? []) as ReservationRow[]);
      setTodayReceipts((receiptsResult.data ?? []) as Receipt[]);
      setClients((clientsResult.data ?? []) as Client[]);
    };

    loadData()
      .catch((error: unknown) => {
        console.error('[Secrétariat] Impossible de charger les données du tableau de bord :', error);
        if (active) {
          setDataError(
            'Impossible de charger les données du secrétariat depuis Supabase. Vérifiez les migrations et vos droits.'
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

  const instructionCount = cases.filter((c) => c.status === 'instruction_cadastre').length;
  const expiringReservations = reservations.filter((r) => {
    const days = daysUntil(r.expiration_date);
    return days >= 0 && days <= 7;
  }).length;
  const todayReceiptsTotal = todayReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

  const recentClients = clients.filter((client) => {
    const days = -daysUntil(client.created_at);
    return days >= 0 && days <= 30;
  });

  const displayClients = clients.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Tableau de Bord — Secrétariat & Accueil
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Gestion du courrier, accueil clients, planification et coordination administrative
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" className="gap-1.5" onClick={() => navigate('/services')}>
            <PlusCircle className="w-4 h-4" />
            Nouveau Dossier Client
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/clients')}>
            <UserPlus className="w-4 h-4" />
            Nouveau Client
          </Button>
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
          Chargement des données du secrétariat…
        </p>
      )}

      {/* Cartes KPI Secrétaire */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Dossiers en Préparation
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {cases.length} dossier{cases.length > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {instructionCount} en instruction cadastre
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Réservations Actives
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {reservations.length} réservation{reservations.length > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-amber-600 font-medium">
              {expiringReservations} expire{expiringReservations > 1 ? 'nt' : ''} sous 7 jours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Reçus du Jour
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {todayReceipts.length} reçu{todayReceipts.length > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{formatCurrency(todayReceiptsTotal)} encaissés</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Clients Récents (30 j)
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-executive-emerald">
                <UserPlus className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {recentClients.length} client{recentClients.length > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Sur {clients.length} au total</p>
          </CardContent>
        </Card>
      </div>

      {/* Listes opérationnelles Secrétariat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dossiers en Préparation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cases.length === 0 && !isLoading && (
              <p className="text-xs text-slate-500 dark:text-executive-darkMuted">Aucun dossier en préparation.</p>
            )}
            {cases.slice(0, 5).map((serviceCase) => {
              const meta = CASE_STATUS_META[serviceCase.status] ?? { label: serviceCase.status, variant: 'neutral' as const };
              return (
                <div
                  key={serviceCase.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-executive-emerald">{serviceCase.reference}</p>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {serviceCase.title}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {clientLabel(serviceCase.client)} · ouvert le {formatDate(serviceCase.opened_date)}
                    </p>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Réservations Actives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reservations.length === 0 && !isLoading && (
              <p className="text-xs text-slate-500 dark:text-executive-darkMuted">Aucune réservation active.</p>
            )}
            {reservations.slice(0, 5).map((reservation) => {
              const days = daysUntil(reservation.expiration_date);
              const variant = days < 0 ? 'danger' : days <= 3 ? 'warning' : 'info';
              return (
                <div
                  key={reservation.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-executive-emerald">{reservation.reference}</p>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {clientLabel(reservation.client)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Parcelle {reservation.plot?.plot_number ?? '—'} · {formatCurrency(reservation.agreed_price)}
                    </p>
                  </div>
                  <Badge variant={variant}>
                    {days < 0 ? 'Expirée' : formatDate(reservation.expiration_date)}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Clients Récents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {displayClients.length === 0 && !isLoading && (
              <p className="text-xs text-slate-500 dark:text-executive-darkMuted">Aucun client enregistré.</p>
            )}
            {displayClients.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {client.company_name || `${client.first_name ?? ''} ${client.last_name}`.trim()}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {client.phone} · {client.city}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400">{formatDate(client.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
