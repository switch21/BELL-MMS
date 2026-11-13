import React from 'react';
import { FileText, Mail, Calendar, Clock, PlusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { isSupabaseConfigured } from '../../lib/supabase';
import { PendingSupabaseModule } from '../../components/shared/PendingSupabaseModule';

export const SecretaryDashboard: React.FC = () => {
  if (isSupabaseConfigured) {
    return (
      <PendingSupabaseModule
        title="Tableau de Bord — Secrétariat & Accueil"
        description="Le suivi des courriers, des dossiers clients et des rendez-vous n'est pas encore alimenté par Supabase."
      />
    );
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
