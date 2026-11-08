import React from 'react';
import { CheckSquare, Briefcase, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

export const CollaboratorDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Mon Espace de Travail — Opérations
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Suivi de vos dossiers assignés, tâches d'exécution et rapports d'activité
          </p>
        </div>
        <Button variant="primary" size="sm" className="gap-1.5">
          <CheckSquare className="w-4 h-4" />
          Créer un Compte-Rendu de Visite
        </Button>
      </div>

      {/* Cartes KPI Collaborateur */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Mes Dossiers Actifs
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-executive-emerald">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              6 dossiers
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              4 fonciers, 2 démarches administratives
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                Tâches à Exécuter
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              9 tâches
            </div>
            <p className="mt-1 text-[11px] text-amber-600 font-medium">
              3 avec échéance cette semaine
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                En Attente de Validation
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              2 demandes
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Soumises au Directeur Général
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-executive-darkMuted uppercase">
                À Compléter / Corrections
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-600">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              1 dossier
            </div>
            <p className="mt-1 text-[11px] text-rose-600 font-medium">
              Plan de bornage manquant (#MUT-04)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Mes Tâches Prioritaires */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mes Tâches & Échéances Immédiates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg">
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 rounded text-executive-emerald focus:ring-executive-emerald" />
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Déposer le plan de lotissement au bureau du Cadastre de Douala 3ème
                </p>
                <p className="text-[11px] text-slate-500">Dossier : Lotissement Japoma — Bloc B</p>
              </div>
            </div>
            <Badge variant="danger">Aujourd'hui</Badge>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg">
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 rounded text-executive-emerald focus:ring-executive-emerald" />
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Contacter le géomètre pour le piquetage des parcelles 14 à 20
                </p>
                <p className="text-[11px] text-slate-500">Projet : Aménagement PK24</p>
              </div>
            </div>
            <Badge variant="warning">Demain</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
