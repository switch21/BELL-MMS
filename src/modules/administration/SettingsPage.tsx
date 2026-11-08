import React, { useState } from 'react';
import { Settings, Save, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { AppSettings } from '../../types/auth.types';
import { DEFAULT_SETTINGS, getStoredData, logAuditEvent, setStoredData, STORAGE_KEYS } from '../../lib/storage';

export const SettingsPage: React.FC = () => {
  const { currentUser, hasRole } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(() =>
    getStoredData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  );
  const [isSaved, setIsSaved] = useState(false);

  const canEdit = hasRole('super_admin');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      alert('Seul le Super Administrateur est habilité à modifier la configuration globale.');
      return;
    }

    const oldSettings = getStoredData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    const updated: AppSettings = {
      ...settings,
      updated_at: new Date().toISOString(),
    };

    setStoredData(STORAGE_KEYS.SETTINGS, updated);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'UPDATE',
      module: 'SETTINGS',
      entity_name: 'app_settings',
      entity_id: 'current',
      old_values: oldSettings,
      new_values: updated,
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Paramètres Généraux de l'Entreprise
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Configuration juridique, monétaire et règles de gestion BELL ENTERPRISE
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            Mode consultation uniquement. La modification de ces paramètres est strictement réservée au Super Administrateur.
          </span>
        </div>
      )}

      {isSaved && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Paramètres mis à jour avec succès et consignés dans le journal d'audit.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identité légale Cameroun */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Raison Sociale & Identification Fiscale (Cameroun)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nom légal de l'entreprise"
                value={settings.company_name}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
              />
              <Input
                label="Forme Juridique"
                value={settings.legal_form}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, legal_form: e.target.value })}
              />
              <Input
                label="RCCM (Registre du Commerce)"
                value={settings.rccm}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, rccm: e.target.value })}
                placeholder="RC/DLA/..."
              />
              <Input
                label="NIU (Numéro d'Identifiant Unique)"
                value={settings.niu}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, niu: e.target.value })}
                placeholder="M1126..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Coordonnées */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Siège Social & Contacts Officiels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Adresse physique"
                value={settings.address}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              />
              <Input
                label="Téléphone principal"
                value={settings.phone}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              />
              <Input
                label="Email de contact"
                type="email"
                value={settings.email}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Règles métier & Finances */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Règles Métier & Seuils de Validation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Devise Principale"
                value={`${settings.currency} (${settings.currency_symbol})`}
                disabled
                helperText="Devise non modifiable dans la V1"
              />
              <Input
                label="Durée max de réservation (Jours)"
                type="number"
                min="1"
                max="60"
                value={settings.default_reservation_duration_days}
                disabled={!canEdit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_reservation_duration_days: parseInt(e.target.value) || 14,
                  })
                }
                helperText="Délai accordé avant annulation automatique"
              />
              <Input
                label="Seuil d'approbation DG Dépenses (FCFA)"
                type="number"
                step="10000"
                value={settings.expense_approval_threshold_dg}
                disabled={!canEdit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    expense_approval_threshold_dg: parseFloat(e.target.value) || 0,
                  })
                }
                helperText="Toute dépense supérieure requiert la validation du DG"
              />
            </div>
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" variant="primary" className="gap-2">
              <Save className="w-4 h-4" />
              Enregistrer les Paramètres
            </Button>
          </div>
        )}
      </form>
    </div>
  );
};
