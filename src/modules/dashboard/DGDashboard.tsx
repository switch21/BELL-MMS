import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  MapPin,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  Building,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { formatCurrency } from '../../lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Sale } from '../../types/sales.types';
import { Plot } from '../../types/land.types';
import { FinancialAccount, ExpenseRequest } from '../../types/finance.types';
import {
  getStoredData,
  INITIAL_SALES,
  INITIAL_PLOTS,
  INITIAL_FINANCIAL_ACCOUNTS,
  INITIAL_EXPENSES,
  STORAGE_KEYS,
} from '../../lib/storage';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export const DGDashboard: React.FC = () => {
  const [sales, setSales] = useState<Sale[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Sale[]>(STORAGE_KEYS.SALES, INITIAL_SALES)
  );
  const [plots, setPlots] = useState<Plot[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Plot[]>(STORAGE_KEYS.PLOTS, INITIAL_PLOTS)
  );
  const [accounts, setAccounts] = useState<FinancialAccount[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<FinancialAccount[]>(STORAGE_KEYS.FINANCIAL_ACCOUNTS, INITIAL_FINANCIAL_ACCOUNTS)
  );
  const [expenses, setExpenses] = useState<ExpenseRequest[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<ExpenseRequest[]>(STORAGE_KEYS.EXPENSE_REQUESTS, INITIAL_EXPENSES)
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    (async () => {
      const [salesResult, plotsResult, accountsResult, expensesResult] = await Promise.all([
        supabase.from('sales').select('*').order('sale_date', { ascending: false }),
        supabase.from('plots').select('*').order('created_at'),
        supabase.from('financial_accounts').select('*').order('code'),
        supabase.from('expense_requests').select('*').order('created_at', { ascending: false }),
      ]);

      for (const result of [salesResult, plotsResult, accountsResult, expensesResult]) {
        if (result.error) throw result.error;
      }

      if (!active) return;
      setSales((salesResult.data ?? []) as Sale[]);
      setPlots((plotsResult.data ?? []) as Plot[]);
      setAccounts((accountsResult.data ?? []) as FinancialAccount[]);
      setExpenses((expensesResult.data ?? []) as ExpenseRequest[]);
    })()
      .catch((error: unknown) => {
        console.error('[Tableau de bord DG] Impossible de charger les indicateurs :', error);
        if (active) {
          setDataError('Impossible de charger les indicateurs de direction depuis Supabase. Vérifiez les migrations et vos droits.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // --- Ventes : chiffre d'affaires = somme des final_price des ventes status 'soldee' ---
  const turnover = sales.filter(s => s.status === 'soldee').reduce((sum, s) => sum + Number(s.final_price), 0);

  // --- Parcelles ---
  const plotsAvailable = plots.filter(p => p.status === 'disponible').length;
  const plotsReserved = plots.filter(p => p.status === 'reservee').length;
  const plotsSold = plots.filter(p => p.status === 'vendue').length;

  // --- Trésorerie ---
  const cashBalance = accounts.reduce((sum, a) => sum + Number(a.current_balance), 0);
  const totalCash = accounts.filter(a => a.account_type === 'caisse').reduce((sum, a) => sum + Number(a.current_balance), 0);
  const totalBanks = accounts.filter(a => a.account_type === 'banque').reduce((sum, a) => sum + Number(a.current_balance), 0);

  // --- Dépenses en attente d'approbation DG ---
  const pendingExpenses = expenses.filter(e => e.status === 'en_attente' && e.requires_dg_approval);
  const pendingExpensesTotal = pendingExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // --- Graphique dynamique : ventes soldées regroupées par mois sur les 6 derniers mois ---
  const chartData = (() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('fr-FR', { month: 'short' });
      months.push({ key, label });
    }

    return months.map(({ key, label }) => {
      // Ventes soldées du mois (en millions FCFA)
      const ventesM = sales
        .filter(s => s.status === 'soldee' && s.sale_date.startsWith(key))
        .reduce((sum, s) => sum + s.final_price, 0) / 1_000_000;

      return {
        month: label.charAt(0).toUpperCase() + label.slice(1),
        Ventes: Math.round(ventesM * 10) / 10,
        // Les dépenses décaissées sur ce mois sont incluses à titre indicatif
        Dépenses: Math.round(
          expenses
            .filter(e => e.status === 'decaisse' && e.expense_date.startsWith(key))
            .reduce((sum, e) => sum + e.amount, 0) / 1_000_000 * 10
        ) / 10,
      };
    });
  })();

  return (
    <div className="space-y-6">
      {/* En-tête du tableau de bord */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Tableau de Bord Général — Direction
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Supervision stratégique, patrimoine foncier et flux financiers BELL ENTERPRISE (XAF)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="emerald" size="md">
            Exercice 2026 — En cours
          </Badge>
        </div>
      </div>

      {dataError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {dataError}
        </div>
      )}
      {isLoading && (
        <p role="status" className="text-xs text-slate-500 dark:text-executive-darkMuted">
          Chargement des indicateurs de direction…
        </p>
      )}

      {/* Cartes KPI Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Chiffre d'Affaires (ventes soldées) */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase tracking-wider">
                Chiffre d'Affaires
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-executive-emerald">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(turnover)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center font-medium">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> Ventes soldées cumulées
            </p>
          </CardContent>
        </Card>

        {/* Trésorerie Disponible (caisses + banques) */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase tracking-wider">
                Trésorerie Disponible
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                <Building className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(cashBalance)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Caisses : {formatCurrency(totalCash)} | Banques : {formatCurrency(totalBanks)}
            </p>
          </CardContent>
        </Card>

        {/* Parcelles Commercialisées */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase tracking-wider">
                Parcelles Commercialisées
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600">
                <MapPin className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {plotsSold} <span className="text-xs font-normal text-slate-500">/ {plots.length} totales</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {plotsAvailable} disponibles, {plotsReserved} réservées
            </p>
          </CardContent>
        </Card>

        {/* Validations Requises */}
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase tracking-wider">
                Validations Requises
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {pendingExpenses.length} dépenses
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Montant total : {formatCurrency(pendingExpensesTotal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Graphique d'activité & Alertes de direction */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graphique comparatif Ventes / Dépenses (en millions) — données dynamiques 6 derniers mois */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Évolution Commerciale &amp; Décaissements (Millions FCFA)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#164B3A',
                      color: '#fff',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="Ventes" fill="#27815E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Dépenses" fill="#B5C9B8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Liste des validations en attente — données chargées (Supabase ou démo) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              Dépenses à Valider par le DG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingExpenses.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 dark:text-executive-darkMuted">
                <CheckCircle className="w-8 h-8 mb-2 text-emerald-500" />
                <p className="text-xs">Aucune dépense en attente</p>
              </div>
            )}

            {/* Dépenses en attente d'approbation DG (données dynamiques) */}
            {pendingExpenses.map(exp => (
              <div
                key={exp.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg space-y-2"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {exp.beneficiary}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Demandeur : {exp.requested_by_name}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">{exp.reference}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatCurrency(exp.amount)}
                  </span>
                </div>
              </div>
            ))}

            {/* Lien vers la page finance pour gérer toutes les dépenses */}
            {pendingExpenses.length > 0 && (
              <Link
                to="/finance"
                className="block text-center text-xs font-medium text-executive-emerald hover:underline pt-1"
              >
                Voir toutes les dépenses →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
