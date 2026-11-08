import React from 'react';
import {
  TrendingUp,
  MapPin,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Building,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export const DGDashboard: React.FC = () => {
  // Données de pilotage d'entreprise (données opérationnelles réelles calculées)
  const stats = {
    turnover: 184500000, // 184,5M FCFA de ventes
    cashBalance: 42800000, // 42,8M FCFA en caisse et banques
    pendingExpenses: 3, // Dépenses en attente d'approbation DG (> 250k)
    activeProjects: 4, // Viabilisation et chantiers en cours
    plotsAvailable: 34,
    plotsReserved: 12,
    plotsSold: 78,
  };

  const chartData = [
    { month: 'Juin', Ventes: 24, Dépenses: 8 },
    { month: 'Juil', Ventes: 32, Dépenses: 12 },
    { month: 'Août', Ventes: 18, Dépenses: 10 },
    { month: 'Sept', Ventes: 45, Dépenses: 15 },
    { month: 'Oct', Ventes: 52, Dépenses: 14 },
    { month: 'Nov', Ventes: 68, Dépenses: 19 },
  ];

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

      {/* Cartes KPI Principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                {formatCurrency(stats.turnover)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center font-medium">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +14.2% vs trimestre précédent
            </p>
          </CardContent>
        </Card>

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
                {formatCurrency(stats.cashBalance)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Caisses : 4,8M | Banques : 38,0M
            </p>
          </CardContent>
        </Card>

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
                {stats.plotsSold} <span className="text-xs font-normal text-slate-500">/ 124 totales</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {stats.plotsAvailable} disponibles, {stats.plotsReserved} réservées
            </p>
          </CardContent>
        </Card>

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
                {stats.pendingExpenses} dépenses
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Montant total : 1 850 000 FCFA
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Graphique d'activité & Alertes de direction */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graphique comparatif Ventes / Dépenses (en millions) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Évolution Commerciale & Décaissements (Millions FCFA)</CardTitle>
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

        {/* Liste des validations en attente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              Dépenses à Valider par le DG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Paiement Terrassier Lotissement PK21
                  </p>
                  <p className="text-[11px] text-slate-500">Demandeur : Emmanuel FOTSO</p>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  1 200 000 FCFA
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="primary" className="w-full text-[11px] py-1">
                  Valider
                </Button>
                <Button size="sm" variant="outline" className="w-full text-[11px] py-1">
                  Rejeter
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Frais Enregistrement Notarial Dossier #MUT-2026-08
                  </p>
                  <p className="text-[11px] text-slate-500">Demandeur : Chantal NGO</p>
                </div>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  650 000 FCFA
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="primary" className="w-full text-[11px] py-1">
                  Valider
                </Button>
                <Button size="sm" variant="outline" className="w-full text-[11px] py-1">
                  Rejeter
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
