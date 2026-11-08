import React, { useState } from 'react';
import { Briefcase, Plus, DollarSign, Building, Search, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { Client } from '../../types/land.types';
import { FinancingCase, FinancingCaseStatus } from '../../types/services.types';
import {
  getStoredData,
  INITIAL_CLIENTS,
  INITIAL_FINANCING_CASES,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { formatCurrency, formatDate } from '../../lib/utils';

export const FinancingPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();

  const [financingCases, setFinancingCases] = useState<FinancingCase[]>(() =>
    getStoredData<FinancingCase[]>(STORAGE_KEYS.FINANCING_CASES, INITIAL_FINANCING_CASES)
  );
  const [clients] = useState<Client[]>(() =>
    getStoredData<Client[]>(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS)
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<FinancingCase | null>(null);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);

  // Formulaire Nouveau Dossier de Financement
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [bankName, setBankName] = useState('UBA Cameroun');
  const [purpose, setPurpose] = useState('');
  const [amountRequested, setAmountRequested] = useState<number>(30000000);
  const [durationMonths, setDurationMonths] = useState<number>(60);
  const [collateral, setCollateral] = useState('Hypothèque de premier rang sur Titre Foncier');
  const [commissionRate, setCommissionRate] = useState<number>(3.0);
  const [notes, setNotes] = useState('');

  // Formulaire Décision Bancaire
  const [decisionStatus, setDecisionStatus] = useState<FinancingCaseStatus>('financement_obtenu');
  const [amountApproved, setAmountApproved] = useState<number>(0);
  const [decisionNotes, setDecisionNotes] = useState('');

  const canWrite = hasPermission('services:write');

  const handleSaveFinancing = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    const ref = `FIN-2026-${String(financingCases.length + 1).padStart(3, '0')}`;
    const commAmount = Math.round((amountRequested * commissionRate) / 100);

    const newCase: FinancingCase = {
      id: `fin-${Date.now()}`,
      reference: ref,
      client_id: client.id,
      partner_bank_name: bankName,
      purpose,
      amount_requested: amountRequested,
      amount_approved: 0,
      duration_months: durationMonths,
      proposed_collateral: collateral,
      status: 'etude',
      assigned_to_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Commercial',
      commission_rate: commissionRate,
      commission_amount: commAmount,
      notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = [newCase, ...financingCases];
    setFinancingCases(updated);
    setStoredData(STORAGE_KEYS.FINANCING_CASES, updated);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'FINANCING',
      entity_name: 'financing_cases',
      entity_id: newCase.id,
      old_values: null,
      new_values: newCase,
    });

    setIsModalOpen(false);
    setPurpose('');
    setNotes('');
  };

  const handleSaveDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;

    const commAmount = Math.round((amountApproved * selectedCase.commission_rate) / 100);

    const updated = financingCases.map((f) => {
      if (f.id === selectedCase.id) {
        return {
          ...f,
          status: decisionStatus,
          amount_approved: amountApproved,
          commission_amount: commAmount,
          decision_date: new Date().toISOString().split('T')[0],
          decision_notes: decisionNotes,
          updated_at: new Date().toISOString(),
        };
      }
      return f;
    });

    setFinancingCases(updated);
    setStoredData(STORAGE_KEYS.FINANCING_CASES, updated);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'UPDATE',
      module: 'FINANCING:DECISION',
      entity_name: 'financing_cases',
      entity_id: selectedCase.id,
      old_values: { status: selectedCase.status, amount_approved: selectedCase.amount_approved },
      new_values: { status: decisionStatus, amount_approved: amountApproved, notes: decisionNotes },
    });

    setIsDecisionModalOpen(false);
    setSelectedCase(null);
  };

  const totalRequested = financingCases.reduce((sum, f) => sum + f.amount_requested, 0);
  const totalApproved = financingCases.reduce((sum, f) => sum + f.amount_approved, 0);
  const totalCommissions = financingCases.reduce((sum, f) => sum + f.commission_amount, 0);

  const filteredCases = financingCases.filter((f) => {
    const client = clients.find((c) => c.id === f.client_id);
    const term = searchTerm.toLowerCase();
    return (
      f.reference.toLowerCase().includes(term) ||
      f.purpose.toLowerCase().includes(term) ||
      f.partner_bank_name.toLowerCase().includes(term) ||
      client?.last_name.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Recherche de Financement & Crédits Immobiliers
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Montage des dossiers de financement bancaire, garanties hypothécaires et commissions d'intermédiation (XAF)
          </p>
        </div>
        {canWrite && (
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Nouveau Dossier de Financement
          </Button>
        )}
      </div>

      {/* Cartes KPI Financement */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Volume Global Recherché</span>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {formatCurrency(totalRequested)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">{financingCases.length} dossiers soumis aux banques</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-emerald-600 uppercase">Financements Obtenus & Débloqués</span>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
              {formatCurrency(totalApproved)}
            </p>
            <p className="text-[11px] text-emerald-600 mt-0.5">Fonds accordés par les comités de crédit</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-executive-emerald uppercase">Honoraires BELL de Montage</span>
            <p className="text-xl font-bold text-executive-emerald mt-1">
              {formatCurrency(totalCommissions)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Commissions perçues (moyenne 3%)</p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau des Dossiers de Financement */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-executive-emerald" />
              Dossiers Bancaires en Cours d'Instruction ({filteredCases.length})
            </CardTitle>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher banque, client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-executive-darkBg border border-slate-200 dark:border-executive-darkBorder rounded-lg text-xs outline-none focus:ring-2 focus:ring-executive-emerald"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Réf.</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Objet du Crédit</th>
                  <th className="py-3 px-4">Banque Sollicitée</th>
                  <th className="py-3 px-4">Montant Demandé</th>
                  <th className="py-3 px-4">Montant Accordé</th>
                  <th className="py-3 px-4">Garantie Proposée</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                {filteredCases.map((item) => {
                  const client = clients.find((c) => c.id === item.client_id);
                  const clientName = client?.client_type === 'entreprise' ? client.company_name : `${client?.first_name || ''} ${client?.last_name || ''}`;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-executive-emerald">
                        {item.reference}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                        {clientName}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {item.purpose}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {item.partner_bank_name}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {formatCurrency(item.amount_requested)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {item.amount_approved > 0 ? formatCurrency(item.amount_approved) : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                        {item.proposed_collateral}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={
                            item.status === 'financement_obtenu'
                              ? 'success'
                              : item.status === 'refuse'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {item.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedCase(item);
                            setAmountApproved(item.amount_approved || item.amount_requested);
                            setDecisionStatus(item.status);
                            setDecisionNotes(item.decision_notes || '');
                            setIsDecisionModalOpen(true);
                          }}
                          className="text-[11px] py-1 px-2.5 h-7"
                        >
                          Mettre à Jour
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modale Nouveau Financement */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Créer un Dossier de Recherche de Financement"
        description="Montage d'une demande de prêt immobilier auprès des banques partenaires au Cameroun."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveFinancing} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Client Emprunteur
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.client_type === 'entreprise' ? c.company_name : `${c.first_name || ''} ${c.last_name}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Banque Partenaire
              </label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
              >
                <option value="UBA Cameroun">UBA Cameroun</option>
                <option value="BICEC">BICEC (Banque Internationale du Cameroun)</option>
                <option value="Afriland First Bank">Afriland First Bank</option>
                <option value="Société Générale Cameroun">Société Générale Cameroun</option>
                <option value="SCB Cameroun">SCB Cameroun</option>
              </select>
            </div>
          </div>

          <Input
            label="Objet du Financement"
            required
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="ex: Crédit Acquisition Terrain Japoma & Travaux"
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Montant Sollicité (FCFA)"
              type="number"
              required
              step="1000000"
              value={amountRequested}
              onChange={(e) => setAmountRequested(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Durée (Mois)"
              type="number"
              value={durationMonths}
              onChange={(e) => setDurationMonths(parseInt(e.target.value) || 60)}
            />
            <Input
              label="Taux Honoraires BELL (%)"
              type="number"
              step="0.5"
              value={commissionRate}
              onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 3.0)}
            />
          </div>

          <Input
            label="Garanties Proposées"
            value={collateral}
            onChange={(e) => setCollateral(e.target.value)}
            placeholder="Titre Foncier, Caution, Domiciliation de salaire..."
          />

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Enregistrer le Dossier Bancaire
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Décision Bancaire */}
      <Modal
        isOpen={isDecisionModalOpen}
        onClose={() => setIsDecisionModalOpen(false)}
        title={`Mise à Jour Décision Bancaire — ${selectedCase?.reference}`}
        description="Notification officielle du comité de crédit de la banque."
      >
        <form onSubmit={handleSaveDecision} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Résultat du Comité de Crédit
            </label>
            <select
              value={decisionStatus}
              onChange={(e) => setDecisionStatus(e.target.value as FinancingCaseStatus)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
            >
              <option value="soumis_banque">Dossier soumis à la banque (En étude)</option>
              <option value="complement_demande">Complément de pièces demandé</option>
              <option value="accepte">Accord de principe notifié</option>
              <option value="financement_obtenu">Financement débloqué avec succès</option>
              <option value="refuse">Crédit refusé par la banque</option>
            </select>
          </div>

          <Input
            label="Montant Définitivement Accordé (FCFA)"
            type="number"
            step="500000"
            value={amountApproved}
            onChange={(e) => setAmountApproved(parseFloat(e.target.value) || 0)}
            helperText={`Commission BELL calculée (${selectedCase?.commission_rate}%) : ${formatCurrency(Math.round((amountApproved * (selectedCase?.commission_rate || 3)) / 100))}`}
          />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Observations / Conditions Bancaires
            </label>
            <textarea
              rows={2}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              placeholder="Taux d'intérêt bancaire, quotité saisissable..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsDecisionModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Enregistrer la Décision
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
