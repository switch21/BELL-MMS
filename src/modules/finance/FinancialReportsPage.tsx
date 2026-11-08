import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  Printer,
  Calendar,
  Building,
  CreditCard,
  PieChart,
  Wallet,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import {
  FinancialAccount,
  FinancialTransaction,
} from '../../types/finance.types';
import { Sale, ThirdPartySettlement } from '../../types/sales.types';
import {
  getStoredData,
  INITIAL_FINANCIAL_ACCOUNTS,
  INITIAL_TRANSACTIONS,
  INITIAL_SALES,
  INITIAL_SETTLEMENTS,
  STORAGE_KEYS,
} from '../../lib/storage';
import { formatCurrency, formatDate } from '../../lib/utils';
import { generateFinancialReportPDF } from '../../lib/pdf-generator';

export const FinancialReportsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year' | 'all'>('all');

  const accounts = getStoredData<FinancialAccount[]>(
    STORAGE_KEYS.FINANCIAL_ACCOUNTS,
    INITIAL_FINANCIAL_ACCOUNTS
  );
  const transactions = getStoredData<FinancialTransaction[]>(
    STORAGE_KEYS.FINANCIAL_TRANSACTIONS,
    INITIAL_TRANSACTIONS
  );
  const sales = getStoredData<Sale[]>(STORAGE_KEYS.SALES, INITIAL_SALES);
  const settlements = getStoredData<ThirdPartySettlement[]>(
    STORAGE_KEYS.THIRD_PARTY_SETTLEMENTS,
    INITIAL_SETTLEMENTS
  );

  // Calculs Trésorerie
  const totalCash = accounts
    .filter(a => a.account_type === 'caisse' && a.is_active)
    .reduce((sum, a) => sum + Number(a.current_balance), 0);

  const totalBank = accounts
    .filter(a => a.account_type === 'banque' && a.is_active)
    .reduce((sum, a) => sum + Number(a.current_balance), 0);

  const totalTreasury = totalCash + totalBank;

  // Calculs Transactions selon filtre
  const filteredTransactions = transactions.filter(t => {
    if (period === 'all') return true;
    const date = new Date(t.transaction_date);
    const now = new Date();
    if (period === 'month') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const tq = Math.floor(date.getMonth() / 3);
      return q === tq && date.getFullYear() === now.getFullYear();
    }
    if (period === 'year') {
      return date.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const totalInflow = filteredTransactions
    .filter(t => t.transaction_type === 'recette')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalOutflow = filteredTransactions
    .filter(t => t.transaction_type === 'depense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const netCashflow = totalInflow - totalOutflow;

  // Créances clients (reste à payer sur ventes)
  const totalReceivables = sales.reduce((sum, s) => sum + Number(s.remaining_balance || 0), 0);

  // Dettes / Reversements Tiers
  // Dettes / Reversements Tiers
const totalPayables = settlements
  .filter(s => s.status !== 'solde')
  .reduce((sum, s) => sum + Number(s.balance_due_to_owner), 0);

  // Marges BELL perçues (commissions sur tiers payées ou facturées)
  const totalMarginBell = sales
    .filter(s => s.is_third_party_plot)
    .reduce((sum, s) => sum + Number(s.bell_margin_amount || 0), 0);

  // Répartition par catégorie de dépense
  const expenseByCategory: Record<string, { label: string; amount: number }> = {
    dep_frais_generaux: { label: 'Frais Généraux & Bureautique', amount: 0 },
    dep_viabilisation: { label: 'Travaux & Aménagement Foncier', amount: 0 },
    dep_carburant: { label: 'Carburant Engins & Véhicules', amount: 0 },
    dep_formalites_juridiques: { label: 'Frais de Notaire & Cadastre', amount: 0 },
    dep_salaires_indemnites: { label: 'Indemnités & Prestations Terrains', amount: 0 },
    autres: { label: 'Autres Charges d’Exploitation', amount: 0 },
  };

  filteredTransactions
    .filter(t => t.transaction_type === 'depense')
    .forEach(t => {
      const cat = t.category_code && expenseByCategory[t.category_code] ? t.category_code : 'autres';
      expenseByCategory[cat].amount += Number(t.amount);
    });

  const categoryList = Object.values(expenseByCategory).filter(c => c.amount > 0);

  // Période textuelle
  const periodLabels: Record<string, string> = {
    month: 'Mois en cours (Novembre 2026)',
    quarter: 'Trimestre en cours (T4 2026)',
    year: 'Exercice annuel 2026',
    all: 'Historique complet des écritures',
  };

  const handleExportPDF = () => {
    generateFinancialReportPDF({
      accounts,
      transactions: filteredTransactions,
      totalCash,
      totalBank,
      totalTreasury,
      totalReceivables,
      totalPayables,
      totalGrossMargin: totalMarginBell,
      generatedByName: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Direction Financière',
      periodLabel: periodLabels[period],
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-executive-dark/40">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-executive-emerald" />
            Rapports & Synthèse Financière Consolidée
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Vision consolidée de la trésorerie, suivi des marges BELL, créances clients et décaissements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sélecteur de période */}
          <div className="flex bg-white dark:bg-executive-dark/60 rounded-xl border border-gray-200 dark:border-white/10 p-1">
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                period === 'month'
                  ? 'bg-executive-emerald text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-executive-emerald'
              }`}
            >
              Ce mois
            </button>
            <button
              onClick={() => setPeriod('quarter')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                period === 'quarter'
                  ? 'bg-executive-emerald text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-executive-emerald'
              }`}
            >
              Trimestre
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                period === 'year'
                  ? 'bg-executive-emerald text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-executive-emerald'
              }`}
            >
              Année 2026
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                period === 'all'
                  ? 'bg-executive-emerald text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-executive-emerald'
              }`}
            >
              Tout
            </button>
          </div>

          <Button
            variant="outline"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </Button>

          <Button
            onClick={handleExportPDF}
            className="bg-executive-green hover:bg-executive-dark text-white flex items-center gap-1.5 text-xs shadow-md"
          >
            <Download className="w-4 h-4" />
            Télécharger PDF Officiel
          </Button>
        </div>
      </div>

      {/* Cartes KPI Principaux */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Trésorerie Globale */}
        <Card className="bg-gradient-to-br from-executive-dark to-executive-green text-white shadow-md">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-executive-soft">
                Trésorerie Totale Disponible
              </span>
              <Wallet className="w-5 h-5 text-emerald-300" />
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {formatCurrency(totalTreasury)}
            </p>
            <div className="mt-3 pt-3 border-t border-white/10 flex justify-between text-xs text-emerald-100">
              <span>Caisses: {formatCurrency(totalCash)}</span>
              <span>Banques: {formatCurrency(totalBank)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Flux Net Période */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Flux Net ({periodLabels[period].split(' ')[0]})
              </span>
              {netCashflow >= 0 ? (
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-rose-600" />
              )}
            </div>
            <p className={`text-2xl font-bold tracking-tight ${netCashflow >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
              {formatCurrency(netCashflow)}
            </p>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 flex justify-between text-xs text-gray-500">
              <span className="text-emerald-600 font-medium">+{formatCurrency(totalInflow)}</span>
              <span className="text-rose-600 font-medium">-{formatCurrency(totalOutflow)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Créances Clients */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Créances Clients (Ventes)
              </span>
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
              {formatCurrency(totalReceivables)}
            </p>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 flex justify-between text-xs text-gray-500">
              <span>{sales.filter(s => s.remaining_balance > 0).length} dossiers actifs</span>
              <span className="text-amber-600 font-medium">À recouvrer</span>
            </div>
          </CardContent>
        </Card>

        {/* Marges BELL & Dettes Tiers */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Commissions & Dettes Tiers
              </span>
              <CreditCard className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-blue-700 dark:text-blue-400">
              {formatCurrency(totalMarginBell)}
            </p>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/5 flex justify-between text-xs text-gray-500">
              <span>Marge BELL (12%)</span>
              <span className="text-rose-600 font-medium">Dettes tiers: {formatCurrency(totalPayables)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Détail de Trésorerie par Compte & Dépenses par Catégorie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Situation par Compte */}
        <Card>
          <CardHeader className="pb-3 border-b border-gray-100 dark:border-white/5">
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="w-5 h-5 text-executive-emerald" />
              Répartition par Compte Bancaire & Caisse
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {accounts.map(acc => {
              const percentage = totalTreasury > 0 ? (Number(acc.current_balance) / totalTreasury) * 100 : 0;
              return (
                <div key={acc.id} className="p-3.5 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={acc.account_type === 'caisse' ? 'emerald' : 'neutral'}
                        className="text-[10px]"
                      >
                        {acc.account_type.toUpperCase()}
                      </Badge>
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">
                        {acc.name}
                      </span>
                    </div>
                    <span className="font-bold text-sm text-gray-900 dark:text-white">
                      {formatCurrency(acc.current_balance)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${acc.account_type === 'caisse' ? 'bg-amber-500' : 'bg-executive-emerald'}`}
                      style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1 text-[11px] text-gray-500">
                    <span>{acc.bank_name || 'Guichet espèces'} ({acc.code})</span>
                    <span>{percentage.toFixed(1)}% du total</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Ventilation des Dépenses par Catégorie */}
        <Card>
          <CardHeader className="pb-3 border-b border-gray-100 dark:border-white/5">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="w-5 h-5 text-rose-500" />
              Ventilation des Dépenses de la Période
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {categoryList.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                Aucune dépense constatée sur cette période d'analyse.
              </div>
            ) : (
              categoryList.map((cat, idx) => {
                const percentage = totalOutflow > 0 ? (cat.amount / totalOutflow) * 100 : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {cat.label}
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {formatCurrency(cat.amount)} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full"
                        style={{ width: `${Math.min(100, percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-sm font-bold">
              <span>Total des Décaissements Validés :</span>
              <span className="text-rose-600">{formatCurrency(totalOutflow)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suivi des Créances Clients (Ventes Échelonnées) */}
      <Card>
        <CardHeader className="pb-3 border-b border-gray-100 dark:border-white/5">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-500" />
            Plan de Recouvrement des Créances Clients (Ventes en cours)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-400 uppercase font-semibold">
                  <th className="p-3">Réf Vente</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Type Vente</th>
                  <th className="p-3">Prix Vendu</th>
                  <th className="p-3">Total Encaissé</th>
                  <th className="p-3">Reste à Recouvrer</th>
                  <th className="p-3">Statut Recouvrement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {sales.map(sale => {
                  const paid = sale.final_price - (sale.remaining_balance || 0);
                  const progress = (paid / sale.final_price) * 100;
                  return (
                    <tr key={sale.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.01]">
                      <td className="p-3 font-semibold text-gray-900 dark:text-white">
                        {sale.reference}
                      </td>
                      <td className="p-3 font-medium text-gray-800 dark:text-gray-200">
                        {sale.client?.first_name ? `${sale.client.first_name} ${sale.client?.last_name ?? ''}`.trim() : ''}
                      </td>
                      <td className="p-3">
                        <Badge variant="neutral" className="text-[10px]">
                          {sale.sale_type === 'comptant' ? 'Comptant' : 'Échelonné'}
                        </Badge>
                      </td>
                      <td className="p-3 font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(sale.final_price)}
                      </td>
                      <td className="p-3 text-emerald-600 font-semibold">
                        {formatCurrency(paid)} ({progress.toFixed(0)}%)
                      </td>
                      <td className="p-3 font-bold text-amber-600">
                        {formatCurrency(sale.remaining_balance)}
                      </td>
                      <td className="p-3">
                        {sale.remaining_balance === 0 ? (
                          <Badge variant="emerald" className="text-[10px]">Soldé (100%)</Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px] text-amber-600 border-amber-300">
                            En cours de paiement
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Derniers mouvements de trésorerie */}
      <Card>
        <CardHeader className="pb-3 border-b border-gray-100 dark:border-white/5 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-executive-emerald" />
            Extrait du Journal Général de Trésorerie
          </CardTitle>
          <Badge variant="neutral" className="text-xs">
            {filteredTransactions.length} écritures
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/5 text-gray-500 uppercase font-semibold">
                  <th className="p-3">Référence</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Compte</th>
                  <th className="p-3">Nature</th>
                  <th className="p-3">Tiers / Libellé</th>
                  <th className="p-3">Montant</th>
                  <th className="p-3">Solde Résiduel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filteredTransactions.slice(0, 10).map(trx => (
                  <tr key={trx.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.01]">
                    <td className="p-3 font-mono font-medium text-gray-900 dark:text-white">
                      {trx.reference}
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">
                      {formatDate(trx.transaction_date)}
                    </td>
                    <td className="p-3 text-gray-800 dark:text-gray-200">
                      {trx.account_name}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={trx.transaction_type === 'recette' ? 'emerald' : 'danger'}
                        className={`text-[10px] ${trx.transaction_type === 'depense' ? 'text-rose-600 border-rose-300' : ''}`}
                      >
                        {trx.transaction_type.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      <div className="font-medium">{trx.beneficiary_or_payer || 'N/A'}</div>
                      <div className="text-[11px] text-gray-400 truncate max-w-xs">{trx.description}</div>
                    </td>
                    <td className="p-3 font-bold">
                      <span className={trx.transaction_type === 'recette' ? 'text-emerald-600' : 'text-rose-600'}>
                        {trx.transaction_type === 'recette' ? '+' : '-'} {formatCurrency(trx.amount)}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-gray-800 dark:text-gray-200">
                      {formatCurrency(trx.balance_after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
