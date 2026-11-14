import React, { useEffect, useState } from 'react';
import { CheckSquare, Briefcase, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { ServiceCase, ServiceCaseStep } from '../../types/services.types';

type ServiceCaseRow = ServiceCase & { steps?: ServiceCaseStep[] };

const daysUntil = (dateString: string): number => {
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

export const CollaboratorDashboard: React.FC = () => {
  if (isSupabaseConfigured) {
    return <ConnectedCollaboratorDashboard />;
  }

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

const ConnectedCollaboratorDashboard: React.FC = () => {
  const { currentUser } = useAuth();

  const [cases, setCases] = useState<ServiceCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }

    let active = true;

    const loadCases = async () => {
      const { data, error } = await supabase
        .from('service_cases')
        .select('*, steps:service_case_steps(*)')
        .eq('assigned_to', currentUser.id)
        .order('opened_date', { ascending: false });

      if (error) throw error;
      if (!active) return;

      const loadedCases = ((data ?? []) as ServiceCaseRow[]).map((row) => ({
        ...row,
        steps: [...(row.steps ?? [])].sort((a, b) => a.step_order - b.step_order),
      }));
      setCases(loadedCases);
    };

    loadCases()
      .catch((error: unknown) => {
        console.error('[Collaborateur] Impossible de charger les dossiers assignés :', error);
        if (active) {
          setDataError(
            'Impossible de charger vos dossiers depuis Supabase. Vérifiez les migrations et vos droits.'
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentUser?.id]);

  const activeCases = cases.filter((c) => c.status !== 'cloture');

  const pendingSteps = activeCases
    .flatMap((serviceCase) =>
      serviceCase.steps
        .filter((step) => step.status === 'en_attente' || step.status === 'en_cours' || step.status === 'bloque')
        .map((step) => ({ serviceCase, step }))
    )
    .sort((a, b) => {
      const aDate = a.serviceCase.target_date ? new Date(a.serviceCase.target_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.serviceCase.target_date ? new Date(b.serviceCase.target_date).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDate !== bDate) return aDate - bDate;
      return a.step.step_order - b.step.step_order;
    });

  const waitingForDG = activeCases.filter((c) => c.dg_validation_status === 'en_attente').length;

  const casesNeedingCorrections = activeCases.filter(
    (c) => c.dg_validation_status === 'rejete' || c.steps.some((step) => step.status === 'bloque')
  );

  const urgentCases = activeCases.filter((c) => {
    if (!c.target_date) return false;
    const days = daysUntil(c.target_date);
    return days >= 0 && days <= 7;
  }).length;

  const renderStepBadge = (serviceCase: ServiceCase, step: ServiceCaseStep) => {
    if (step.status === 'bloque') return <Badge variant="danger">Bloquée</Badge>;
    if (!serviceCase.target_date) return <Badge variant="neutral">Sans échéance</Badge>;

    const days = daysUntil(serviceCase.target_date);
    if (days < 0) return <Badge variant="danger">En retard</Badge>;
    if (days === 0) return <Badge variant="danger">Aujourd'hui</Badge>;
    if (days <= 7) return <Badge variant="warning">{formatDate(serviceCase.target_date)}</Badge>;
    return <Badge variant="info">{formatDate(serviceCase.target_date)}</Badge>;
  };

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
          Chargement de vos dossiers assignés…
        </p>
      )}

      {!isLoading && !currentUser?.id && (
        <p role="status" className="text-xs text-slate-500 dark:text-executive-darkMuted">
          Aucun compte utilisateur chargé : impossible de déterminer vos dossiers assignés.
        </p>
      )}

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
              {activeCases.length} dossier{activeCases.length > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Sur {cases.length} dossier{cases.length > 1 ? 's' : ''} assigné{cases.length > 1 ? 's' : ''}
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
              {pendingSteps.length} tâche{pendingSteps.length > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-amber-600 font-medium">
              {urgentCases} dossier{urgentCases > 1 ? 's' : ''} à échéance sous 7 jours
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
              {waitingForDG} dossier{waitingForDG > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Soumis au Directeur Général</p>
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
              {casesNeedingCorrections.length} dossier{casesNeedingCorrections.length > 1 ? 's' : ''}
            </div>
            <p className="mt-1 text-[11px] text-rose-600 font-medium">
              {casesNeedingCorrections.length > 0
                ? `Dossier #${casesNeedingCorrections[0].reference}`
                : 'Aucune correction en attente'}
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
          {pendingSteps.length === 0 && !isLoading && (
            <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
              Aucune tâche en attente sur vos dossiers assignés.
            </p>
          )}

          {pendingSteps.slice(0, 6).map(({ serviceCase, step }) => (
            <div
              key={step.id}
              className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 text-slate-400">
                  {step.status === 'bloque' ? (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  ) : (
                    <Clock className="w-4 h-4 text-executive-emerald" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{step.title}</p>
                  <p className="text-[11px] text-slate-500">
                    Dossier : {serviceCase.reference} — {serviceCase.title}
                  </p>
                </div>
              </div>
              {renderStepBadge(serviceCase, step)}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
