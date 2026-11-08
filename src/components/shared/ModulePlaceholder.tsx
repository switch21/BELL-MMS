import React from 'react';
import { LucideIcon, Clock, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface ModulePlaceholderProps {
  title: string;
  phase: string;
  description: string;
  features: string[];
  icon: LucideIcon;
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({
  title,
  phase,
  description,
  features,
  icon: Icon,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Icon className="w-5 h-5 text-executive-emerald" />
            {title}
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            {description}
          </p>
        </div>
        <Badge variant="emerald">{phase}</Badge>
      </div>

      <Card>
        <CardContent className="p-8 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-executive-emerald/15 text-executive-emerald flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Module Prévu pour la {phase}
            </h2>
            <p className="text-xs text-slate-500 dark:text-executive-darkMuted mt-1">
              Conformément à la règle de développement progressif obligatoire, ce module sera développé immédiatement après validation de la phase en cours.
            </p>
          </div>

          <div className="text-left bg-slate-50 dark:bg-executive-darkBg p-4 rounded-xl border border-slate-200 dark:border-executive-darkBorder space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Fonctionnalités prises en charge dans ce module :
            </p>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-executive-emerald shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
