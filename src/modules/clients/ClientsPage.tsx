import React, { useEffect, useState } from 'react';
import { Users, Plus, Phone, Mail, MapPin, Building, Search, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { Client, Partner } from '../../types/land.types';
import {
  getStoredData,
  INITIAL_CLIENTS,
  INITIAL_PARTNERS,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { formatPhone } from '../../lib/utils';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export const ClientsPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'clients' | 'partners'>('clients');

  const [clients, setClients] = useState<Client[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Client[]>(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS)
  );
  const [partners, setPartners] = useState<Partner[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Partner[]>(STORAGE_KEYS.PARTNERS, INITIAL_PARTNERS)
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);

  // Formulaire Client
  const [clientType, setClientType] = useState<'particulier' | 'entreprise'>('particulier');
  const [clientLastName, setClientLastName] = useState('');
  const [clientFirstName, setClientFirstName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientCni, setClientCni] = useState('');
  const [clientPhone, setClientPhone] = useState('+237 ');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientCity, setClientCity] = useState('Douala');
  const [clientNotes, setClientNotes] = useState('');

  // Formulaire Partenaire
  const [partnerName, setPartnerName] = useState('');
  const [partnerType, setPartnerType] = useState<Partner['partner_type']>('proprietaire_foncier');
  const [partnerContact, setPartnerContact] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('+237 ');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerAddress, setPartnerAddress] = useState('');
  const [partnerCommission, setPartnerCommission] = useState(0);
  const [partnerNotes, setPartnerNotes] = useState('');

  const canWrite = hasPermission('clients:write');

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isActive = true;
    const loadRecords = async () => {
      setIsLoading(true);
      setDataError(null);
      try {
        const [clientsResult, partnersResult] = await Promise.all([
          supabase.from('clients').select('*').order('created_at', { ascending: false }),
          supabase.from('partners').select('*').order('created_at', { ascending: false }),
        ]);

        if (clientsResult.error) throw clientsResult.error;
        if (partnersResult.error) throw partnersResult.error;
        if (!isActive) return;

        setClients((clientsResult.data ?? []) as Client[]);
        setPartners((partnersResult.data ?? []) as Partner[]);
      } catch (error) {
        if (isActive) {
          console.error('[Supabase] Impossible de charger les clients et partenaires :', error);
          setDataError('Impossible de charger les données depuis Supabase. Vérifiez la connexion, les migrations et vos droits.');
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void loadRecords();
    return () => {
      isActive = false;
    };
  }, []);

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setDataError(null);
    const newClient: Client = {
      id: crypto.randomUUID(),
      code: `CLI-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      client_type: clientType,
      first_name: clientFirstName,
      last_name: clientLastName,
      company_name: clientType === 'entreprise' ? clientCompany : undefined,
      cni_number: clientCni,
      phone: clientPhone,
      email: clientEmail,
      address: clientAddress,
      city: clientCity,
      country: 'Cameroun',
      notes: clientNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      let savedClient = newClient;
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('clients').insert(newClient).select().single();
        if (error) throw error;
        if (!data) throw new Error('Supabase n’a retourné aucun client créé.');
        savedClient = data as Client;
      }

      const updated = [savedClient, ...clients];
      setClients(updated);
      if (!isSupabaseConfigured) {
        setStoredData(STORAGE_KEYS.CLIENTS, updated);
        logAuditEvent({
          user_id: currentUser?.id || null,
          user_email: currentUser?.email || null,
          action: 'CREATE',
          module: 'CLIENTS',
          entity_name: 'clients',
          entity_id: savedClient.id,
          old_values: null,
          new_values: savedClient,
        });
      }

      setIsClientModalOpen(false);
      resetClientForm();
    } catch (error) {
      console.error('[Clients] Échec de création du client :', error);
      setDataError(error instanceof Error ? error.message : 'La création du client a échoué.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setDataError(null);
    const newPartner: Partner = {
      id: crypto.randomUUID(),
      code: `PAR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      partner_type: partnerType,
      name: partnerName,
      contact_person: partnerContact,
      phone: partnerPhone,
      email: partnerEmail,
      address: partnerAddress,
      city: 'Douala',
      commission_rate: partnerCommission,
      notes: partnerNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      let savedPartner = newPartner;
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('partners').insert(newPartner).select().single();
        if (error) throw error;
        if (!data) throw new Error('Supabase n’a retourné aucun partenaire créé.');
        savedPartner = data as Partner;
      }

      const updated = [savedPartner, ...partners];
      setPartners(updated);
      if (!isSupabaseConfigured) {
        setStoredData(STORAGE_KEYS.PARTNERS, updated);
        logAuditEvent({
          user_id: currentUser?.id || null,
          user_email: currentUser?.email || null,
          action: 'CREATE',
          module: 'PARTNERS',
          entity_name: 'partners',
          entity_id: savedPartner.id,
          old_values: null,
          new_values: savedPartner,
        });
      }

      setIsPartnerModalOpen(false);
      resetPartnerForm();
    } catch (error) {
      console.error('[Clients] Échec de création du partenaire :', error);
      setDataError(error instanceof Error ? error.message : 'La création du partenaire a échoué.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetClientForm = () => {
    setClientLastName('');
    setClientFirstName('');
    setClientCompany('');
    setClientCni('');
    setClientPhone('+237 ');
    setClientEmail('');
    setClientAddress('');
    setClientNotes('');
  };

  const resetPartnerForm = () => {
    setPartnerName('');
    setPartnerContact('');
    setPartnerPhone('+237 ');
    setPartnerEmail('');
    setPartnerAddress('');
    setPartnerCommission(0);
    setPartnerNotes('');
  };

  const filteredClients = clients.filter(
    (c) =>
      c.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPartners = partners.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm) ||
      p.partner_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const partnerTypeLabels: Record<string, string> = {
    proprietaire_foncier: 'Propriétaire Foncier',
    apporteur_affaires: 'Apporteur d\'Affaires',
    geometre: 'Cabinet de Géomètre',
    notaire: 'Étude Notariale',
    banque: 'Institution Financière',
    prestataire: 'Prestataire Travaux',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Référentiel Clients & Partenaires
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Gestion centralisée des acquéreurs, propriétaires de terrains sous mandat, géomètres et notaires
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsClientModalOpen(true)}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nouveau Client
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPartnerModalOpen(true)}
              className="gap-1.5"
            >
              <Building className="w-4 h-4" />
              Nouveau Partenaire
            </Button>
          </div>
        )}
      </div>

      {dataError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {dataError}
        </div>
      )}

      {isLoading && (
        <p role="status" className="text-xs text-slate-500 dark:text-executive-darkMuted">
          Chargement des clients et partenaires…
        </p>
      )}

      {/* Onglets & Barre de recherche */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-executive-darkBorder pb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'clients'
                ? 'bg-executive-dark text-white shadow-sm'
                : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            Clients Acquéreurs ({clients.length})
          </button>
          <button
            onClick={() => setActiveTab('partners')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'partners'
                ? 'bg-executive-dark text-white shadow-sm'
                : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            Partenaires & Propriétaires ({partners.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone, code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-executive-darkSurface border border-slate-200 dark:border-executive-darkBorder rounded-lg text-xs outline-none focus:ring-2 focus:ring-executive-emerald"
          />
        </div>
      </div>

      {/* Contenu de l'onglet Clients */}
      {activeTab === 'clients' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-executive-emerald" />
              Liste des Clients Enregistrés
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Réf & Type</th>
                    <th className="py-3 px-4">Identité Client</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">CNI / Identifiant</th>
                    <th className="py-3 px-4">Ville & Adresse</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-executive-emerald">
                          {client.code}
                        </span>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {client.client_type}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                        {client.client_type === 'entreprise'
                          ? client.company_name
                          : `${client.first_name || ''} ${client.last_name}`}
                        {client.client_type === 'entreprise' && (
                          <div className="text-[11px] font-normal text-slate-500">
                            Représentant : {client.first_name} {client.last_name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-700 dark:text-slate-300">
                          {formatPhone(client.phone)}
                        </div>
                        {client.email && (
                          <div className="text-[11px] text-slate-400">{client.email}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {client.cni_number || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {client.address ? `${client.address}, ` : ''}{client.city}
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic max-w-xs truncate">
                        {client.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contenu de l'onglet Partenaires */}
      {activeTab === 'partners' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Building className="w-4 h-4 text-executive-emerald" />
              Répertoire des Propriétaires de Terrains & Partenaires
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Réf</th>
                    <th className="py-3 px-4">Nom / Raison Sociale</th>
                    <th className="py-3 px-4">Type de Partenaire</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Commission</th>
                    <th className="py-3 px-4">Observations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                  {filteredPartners.map((partner) => (
                    <tr
                      key={partner.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-executive-emerald">
                        {partner.code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {partner.name}
                        </div>
                        {partner.contact_person && (
                          <div className="text-[11px] text-slate-500">
                            Interlocuteur : {partner.contact_person}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            partner.partner_type === 'proprietaire_foncier'
                              ? 'emerald'
                              : partner.partner_type === 'apporteur_affaires'
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {partnerTypeLabels[partner.partner_type] || partner.partner_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-700 dark:text-slate-300">
                          {formatPhone(partner.phone)}
                        </div>
                        {partner.email && (
                          <div className="text-[11px] text-slate-400">{partner.email}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        {partner.commission_rate > 0 ? `${partner.commission_rate}%` : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                        {partner.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modale d'ajout d'un client */}
      <Modal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        title="Enregistrer un Nouveau Client"
        description="Fiche individuelle certifiée pour acquisitions et dossiers fonciers."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveClient} className="space-y-4">
          <div className="flex gap-4 p-2 bg-slate-50 dark:bg-executive-darkBg rounded-lg border border-slate-200 dark:border-executive-darkBorder text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="clientType"
                checked={clientType === 'particulier'}
                onChange={() => setClientType('particulier')}
                className="text-executive-emerald focus:ring-executive-emerald"
              />
              <span className="font-semibold">Personne Physique (Particulier)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="clientType"
                checked={clientType === 'entreprise'}
                onChange={() => setClientType('entreprise')}
                className="text-executive-emerald focus:ring-executive-emerald"
              />
              <span className="font-semibold">Personne Morale (Entreprise / SCI)</span>
            </label>
          </div>

          {clientType === 'entreprise' && (
            <Input
              label="Raison Sociale de l'Entreprise"
              required
              value={clientCompany}
              onChange={(e) => setClientCompany(e.target.value)}
              placeholder="ex: SCI DE LA LOBE"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nom de famille"
              required
              value={clientLastName}
              onChange={(e) => setClientLastName(e.target.value)}
            />
            <Input
              label="Prénom"
              value={clientFirstName}
              onChange={(e) => setClientFirstName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Téléphone (Cameroun)"
              required
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="+237 6..."
            />
            <Input
              label="Numéro CNI ou Passeport"
              value={clientCni}
              onChange={(e) => setClientCni(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
            />
            <Input
              label="Ville"
              value={clientCity}
              onChange={(e) => setClientCity(e.target.value)}
            />
          </div>

          <Input
            label="Adresse / Quartier"
            value={clientAddress}
            onChange={(e) => setClientAddress(e.target.value)}
            placeholder="ex: Bonamoussadi, Carrefour..."
          />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Observations & Besoins
            </label>
            <textarea
              rows={2}
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              placeholder="Critères recherchés, budget prévisionnel..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsClientModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
              Enregistrer le Client
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale d'ajout d'un partenaire */}
      <Modal
        isOpen={isPartnerModalOpen}
        onClose={() => setIsPartnerModalOpen(false)}
        title="Enregistrer un Partenaire ou Propriétaire Foncier"
        description="Fiche de relation contractuelle ou de mandat."
        maxWidth="lg"
      >
        <form onSubmit={handleSavePartner} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Type de Partenaire
            </label>
            <select
              value={partnerType}
              onChange={(e) => setPartnerType(e.target.value as any)}
              className="w-full px-3.5 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-sm text-slate-900 dark:text-white"
            >
              <option value="proprietaire_foncier">Propriétaire Foncier (Mandats)</option>
              <option value="apporteur_affaires">Apporteur d'Affaires Commercial</option>
              <option value="geometre">Cabinet de Géomètre Assermenté</option>
              <option value="notaire">Étude Notariale</option>
              <option value="banque">Banque / Établissement Financier</option>
              <option value="prestataire">Prestataire Travaux & Viabilisation</option>
            </select>
          </div>

          <Input
            label="Nom complet ou Raison Sociale"
            required
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder="ex: Famille Eyango / Cabinet MBIA"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Personne de Contact"
              value={partnerContact}
              onChange={(e) => setPartnerContact(e.target.value)}
            />
            <Input
              label="Téléphone"
              required
              value={partnerPhone}
              onChange={(e) => setPartnerPhone(e.target.value)}
              placeholder="+237 6..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email"
              type="email"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
            />
            <Input
              label="Taux Commission si Apporteur (%)"
              type="number"
              step="0.5"
              value={partnerCommission}
              onChange={(e) => setPartnerCommission(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Notes & Spécificités Contractuelles
            </label>
            <textarea
              rows={2}
              value={partnerNotes}
              onChange={(e) => setPartnerNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              placeholder="Détails du mandat, références de titres..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsPartnerModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
              Enregistrer le Partenaire
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
