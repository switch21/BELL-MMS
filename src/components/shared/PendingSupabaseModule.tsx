import React from 'react';
import { Database } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';

interface PendingSupabaseModuleProps {
  title: string;
  description: string;
}

export const PendingSupabaseModule: React.FC<PendingSupabaseModuleProps> = ({
  title,
  description,
}) => (
  <div className="space-y-6">
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
    </div>
    <Card>
      <CardContent className="p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600">
          <Database className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">
          Module non raccordé à Supabase
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-executive-darkMuted max-w-xl mx-auto">
          {description}
        </p>
        <p className="mt-3 text-xs text-slate-500 dark:text-executive-darkMuted">
          Les données de démonstration ne sont volontairement pas affichées en mode connecté.
        </p>
      </CardContent>
    </Card>
  </div>
);
