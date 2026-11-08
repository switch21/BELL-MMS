import React, { useState } from 'react';
import {
  FileText,
  Plus,
  CheckCircle,
  Clock,
  AlertTriangle,
  Search,
  UserCheck,
  Building,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { Client } from '../../types/land.types';
import {
  ServiceCase,
  ServiceType,
  ServiceCaseStatus,
  DGValidationStatus,
  ServiceCaseStep,
} from '../../types/services.types';
import {
  getStoredData,
  INITIAL_CLIENTS,
  INITIAL_SERVICE_CASES,
  INITIAL_SERVICE_TYPES,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/utils';

export const ServicesPage: React.FC = () => {
  const { currentUser, hasRole, hasPermission } = useAuth();

  const [cases, setCases] = useState<ServiceCase[]>(() =>
    getStoredData<ServiceCase[]>(STORAGE_KEYS.SERVICE_CASES, INITIAL_SERVICE_CASES)
  );
  const [serviceTypes] = useState<ServiceType[]>(() =>
    getStoredData<ServiceType[]>(STORAGE_KEYS.SERVICE_TYPES, INITIAL_SERVICE_TYPES)
  );
  const [clients] = useState<Client[]>(() =>
    getStoredData<Client[]>(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS)
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCase, setSelectedCase] = useState<ServiceCase | null>(null);
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Formulaire Nouveau Dossier
  const [caseClientId, setCaseClientId] = useState(clients[0]?.id || '');
  const [caseTypeId, setCaseTypeId] = useState(serviceTypes[0]?.id || '');
  const [caseTitle, setCaseTitle] = useState('');
  const [caseFee, setCaseFee] = useState<number>(serviceTypes[0]?.standard_fee || 750000);
  const [caseExpensesEst, setCaseExpensesEst] = useState<number>(300000);
  const [caseTargetDate, setCaseTargetDate] = useState('');
  const [caseNotes, setCaseNotes] = useState('');

  // Formulaire Décision DG
  const [dgDecision, setDgDecision] = useState<'approuve' | 'rejete'>('approuve');
  const [dgComment, setDgComment] = useState('');

  const isDG = hasRole(['directeur_general', 'super_admin']);
  const canWrite = hasPermission('services:write');

  // 1. CRÉATION D'UN DOSSIER
  const handleSaveCase = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === caseClientId);
    const serviceType = serviceTypes.find((s) => s.id === caseTypeId);

    if (!client || !serviceType) return;

    const ref = `DOS-2026-${String(cases.length + 1).padStart(3, '0')}`;

    // Génération des étapes de workflow par défaut
    const defaultSteps: ServiceCaseStep[] = [
      { id: `step-${Date.now()}-1`, case_id: `case-${Date.now()}`, step_order: 1, title: 'Collecte et examen des pièces justificatives', status: 'en_cours' },
      { id: `step-${Date.now()}-2`, case_id: `case-${Date.now()}`, step_order: 2, title: 'Rédaction technique / acte notarié / requête TPI', status: 'en_attente' },
      { id: `step-${Date.now()}-3`, case_id: `case-${Date.now()}`, step_order: 3, title: 'Dépôt et suivi auprès de l\'administration compétente (Cadastre / MINDCAF / Tribunal)', status: 'en_attente' },
      { id: `step-${Date.now()}-4`, case_id: `case-${Date.now()}`, step_order: 4, title: 'Contrôle et validation formelle de la Direction Générale', status: 'en_attente' },
      { id: `step-${Date.now()}-5`, case_id: `case-${Date.now()}`, step_order: 5, title: 'Clôture du dossier et remise des actes finaux au client', status: 'en_attente' },
    ];

    const newCase: ServiceCase = {
      id: `case-${Date.now()}`,
      reference: ref,
      client_id: client.id,
      service_type_id: serviceType.id,
      title: caseTitle || `${serviceType.name} — ${client.last_name}`,
      assigned_to_id: currentUser?.id,
      assigned_to_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Collaborateur',
      opened_date: new Date().toISOString().split('T')[0],
      target_date: caseTargetDate || undefined,
      status: 'pieces_en_cours',
      fee_agreed: caseFee,
      expenses_estimated: caseExpensesEst,
      expenses_actual: 0,
      amount_paid: 0,
      dg_validation_status: 'non_soumis',
      steps: defaultSteps,
      notes: caseNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = [newCase, ...cases];
    setCases(updated);
    setStoredData(STORAGE_KEYS.SERVICE_CASES, updated);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'SERVICES',
      entity_name: 'service_cases',
      entity_id: newCase.id,
      old_values: null,
      new_values: newCase,
    });

    setIsNewCaseModalOpen(false);
    setCaseTitle('');
    setCaseNotes('');
  };

  // 2. AVANCEMENT D'UNE ÉTAPE DU WORKFLOW
  const handleToggleStep = (stepId: string) => {
    if (!selectedCase) return;

    const updatedSteps = selectedCase.steps.map((st) => {
      if (st.id === stepId) {
        const nextStatus = st.status === 'termine' ? 'en_cours' : 'termine';
        return {
          ...st,
          status: nextStatus as any,
          completed_by_name: nextStatus === 'termine' ? `${currentUser?.first_name} ${currentUser?.last_name}` : undefined,
          completed_at: nextStatus === 'termine' ? new Date().toISOString() : undefined,
        };
      }
      return st;
    });

    const updatedCase = {
      ...selectedCase,
      steps: updatedSteps,
      updated_at: new Date().toISOString(),
    };

    const updatedCases = cases.map((c) => (c.id === selectedCase.id ? updatedCase : c));
    setCases(updatedCases);
    setSelectedCase(updatedCase);
    setStoredData(STORAGE_KEYS.SERVICE_CASES, updatedCases);
  };

  // 3. SOUMISSION AU DIRECTEUR GÉNÉRAL POUR ARBITRAGE
  const handleSubmitToDG = () => {
    if (!selectedCase) return;

    const updatedCase: ServiceCase = {
      ...selectedCase,
      status: 'soumis_validation_dg',
      dg_validation_status: 'en_attente',
      updated_at: new Date().toISOString(),
    };

    const updatedCases = cases.map((c) => (c.id === selectedCase.id ? updatedCase : c));
    setCases(updatedCases);
    setSelectedCase(updatedCase);
    setStoredData(STORAGE_KEYS.SERVICE_CASES, updatedCases);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'UPDATE',
      module: 'SERVICES',
      entity_name: 'service_cases:submit_dg',
      entity_id: selectedCase.id,
      old_values: { dg_status: selectedCase.dg_validation_status },
      new_values: { dg_status: 'en_attente' },
    });

    alert('Dossier soumis avec succès pour arbitrage de Monsieur le Directeur Général.');
  };

  // 4. DÉCISION DU DIRECTEUR GÉNÉRAL (Approbation / Rejet / Observations)
  const handleDGDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !isDG) return;

    const isApproved = dgDecision === 'approuve';

    const updatedCase: ServiceCase = {
      ...selectedCase,
      dg_validation_status: isApproved ? 'approuve' : 'rejete',
      status: isApproved ? 'approuve_dg' : 'rejete_dg',
      dg_validated_by_name: `${currentUser?.first_name} ${currentUser?.last_name}`,
      dg_validation_date: new Date().toISOString(),
      dg_notes: dgComment,
      updated_at: new Date().toISOString(),
    };

    const updatedCases = cases.map((c) => (c.id === selectedCase.id ? updatedCase : c));
    setCases(updatedCases);
    setSelectedCase(updatedCase);
    setStoredData(STORAGE_KEYS.SERVICE_CASES, updatedCases);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'VALIDATE',
      module: 'SERVICES:DG_ARBITRAGE',
      entity_name: 'service_cases',
      entity_id: selectedCase.id,
      old_values: { dg_status: selectedCase.dg_validation_status },
      new_values: { dg_decision: dgDecision, dg_comment: dgComment },
    });

    setDgComment('');
    alert(`Décision de direction enregistrée : Dossier ${isApproved ? 'APPROUVÉ' : 'REJETÉ'}.`);
  };

  const filteredCases = cases.filter((c) => {
    const client = clients.find((cl) => cl.id === c.client_id);
    const term = searchTerm.toLowerCase();
    return (
      c.reference.toLowerCase().includes(term) ||
      c.title.toLowerCase().includes(term) ||
      client?.last_name.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Assistance Administrative & Prestations Foncières
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Mutations foncières, jugements d'hérédité, bornages contradictoires et circuit de validation Direction Générale
          </p>
        </div>
        {canWrite && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsNewCaseModalOpen(true)}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Ouvrir un Dossier de Prestation
          </Button>
        )}
      </div>

      {/* Cartes KPI Dossiers */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Dossiers en Cours</span>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{cases.length} dossiers</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Instruction administrative active</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-amber-600 uppercase">À Valider par le DG</span>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">
              {cases.filter((c) => c.dg_validation_status === 'en_attente').length} en attente
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Circuit d'approbation préalable</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Honoraires Convenus</span>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {formatCurrency(cases.reduce((sum, c) => sum + c.fee_agreed, 0))}
            </p>
            <p className="text-[11px] text-emerald-600 mt-0.5">Facturation prestations</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Frais Réels Engagés</span>
            <p className="text-xl font-bold text-slate-700 dark:text-slate-300 mt-1">
              {formatCurrency(cases.reduce((sum, c) => sum + c.expenses_actual, 0))}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Droits d'enregistrement & géomètre</p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau des Dossiers */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-executive-emerald" />
              Répertoire des Dossiers d'Assistance & Formalités ({filteredCases.length})
            </CardTitle>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher référence, client..."
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
                  <th className="py-3 px-4">Objet & Prestation</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Responsable</th>
                  <th className="py-3 px-4">Honoraires</th>
                  <th className="py-3 px-4 text-center">Validation DG</th>
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
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Ouvert le {formatDate(item.opened_date)} {item.target_date ? `| Cible : ${formatDate(item.target_date)}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {clientName}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {item.assigned_to_name}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        {formatCurrency(item.fee_agreed)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={
                            item.dg_validation_status === 'approuve'
                              ? 'success'
                              : item.dg_validation_status === 'en_attente'
                              ? 'warning'
                              : item.dg_validation_status === 'rejete'
                              ? 'danger'
                              : 'neutral'
                          }
                        >
                          {item.dg_validation_status === 'approuve'
                            ? 'Approuvé DG'
                            : item.dg_validation_status === 'en_attente'
                            ? 'En attente DG'
                            : item.dg_validation_status === 'rejete'
                            ? 'Rejeté'
                            : 'Non soumis'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="info">
                          {item.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedCase(item);
                            setIsDetailModalOpen(true);
                          }}
                          className="text-[11px] py-1 px-2.5 h-7"
                        >
                          Gérer le Dossier
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

      {/* Modale d'ouverture de dossier */}
      <Modal
        isOpen={isNewCaseModalOpen}
        onClose={() => setIsNewCaseModalOpen(false)}
        title="Ouvrir un Dossier de Prestation Administrative"
        description="Constitution d'une mission foncière, notariale ou judiciaire."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveCase} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Client Demandeur
              </label>
              <select
                value={caseClientId}
                onChange={(e) => setCaseClientId(e.target.value)}
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
                Nature de la Prestation
              </label>
              <select
                value={caseTypeId}
                onChange={(e) => {
                  setCaseTypeId(e.target.value);
                  const st = serviceTypes.find((s) => s.id === e.target.value);
                  if (st) setCaseFee(st.standard_fee);
                }}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
              >
                {serviceTypes.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Intitulé du Dossier"
            required
            value={caseTitle}
            onChange={(e) => setCaseTitle(e.target.value)}
            placeholder="ex: Mutation Foncière TF 2011/Wouri — Akwa Nord"
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Honoraires Convenus (FCFA)"
              type="number"
              required
              step="50000"
              value={caseFee}
              onChange={(e) => setCaseFee(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Frais Prévisionnels (FCFA)"
              type="number"
              step="50000"
              value={caseExpensesEst}
              onChange={(e) => setCaseExpensesEst(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Date Cible d'Achèvement"
              type="date"
              value={caseTargetDate}
              onChange={(e) => setCaseTargetDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Observations & Instructions
            </label>
            <textarea
              rows={2}
              value={caseNotes}
              onChange={(e) => setCaseNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              placeholder="Tribunal compétent, notaire désigné, particularités du dossier..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsNewCaseModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Enregistrer & Générer le Workflow
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale de Détails & Arbitrage DG */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Instruction du Dossier : ${selectedCase?.reference}`}
        description={selectedCase?.title}
        maxWidth="xl"
      >
        {selectedCase && (
          <div className="space-y-6">
            {/* Informations financières du dossier */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-executive-darkBg rounded-xl border border-slate-200 dark:border-executive-darkBorder text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Honoraires Prévus</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5">{formatCurrency(selectedCase.fee_agreed)}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Frais Réels Décaissés</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5">{formatCurrency(selectedCase.expenses_actual)}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Statut Validation DG</span>
                <p className="font-bold text-amber-600 mt-0.5 capitalize">{selectedCase.dg_validation_status}</p>
              </div>
            </div>

            {/* Workflow par étapes */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-executive-emerald" />
                Avancement des Étapes du Dossier
              </h4>
              <div className="space-y-2">
                {selectedCase.steps.map((st) => (
                  <div
                    key={st.id}
                    onClick={() => handleToggleStep(st.id)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                      st.status === 'termine'
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                        : 'bg-white dark:bg-executive-darkSurface border-slate-200 dark:border-executive-darkBorder hover:border-executive-emerald'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                          st.status === 'termine'
                            ? 'bg-executive-emerald text-white'
                            : 'border-2 border-slate-300 text-slate-400'
                        }`}
                      >
                        {st.status === 'termine' ? '✓' : st.step_order}
                      </div>
                      <div>
                        <p className={`text-xs font-semibold ${st.status === 'termine' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                          {st.title}
                        </p>
                        {st.completed_by_name && (
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                            Validé par {st.completed_by_name} le {formatDateTime(st.completed_at)}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant={st.status === 'termine' ? 'success' : 'neutral'}>
                      {st.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Zone d'action Collaborateur : Soumettre au DG */}
            {selectedCase.dg_validation_status === 'non_soumis' && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-300">
                    Dossier Prêt pour Arbitrage Direction
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Transmettre le dossier pour validation formelle par le Directeur Général.
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={handleSubmitToDG} className="gap-1.5">
                  <ArrowRight className="w-4 h-4" />
                  Soumettre au DG
                </Button>
              </div>
            )}

            {/* Zone d'arbitrage exclusive au Directeur Général */}
            {isDG && selectedCase.dg_validation_status === 'en_attente' && (
              <form onSubmit={handleDGDecision} className="p-4 bg-executive-dark text-white rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-executive-emerald" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Arbitrage Direction Générale — Validation du Dossier
                  </h4>
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="dgDecision"
                      checked={dgDecision === 'approuve'}
                      onChange={() => setDgDecision('approuve')}
                    />
                    <span>Approuver Formellement le Dossier</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="dgDecision"
                      checked={dgDecision === 'rejete'}
                      onChange={() => setDgDecision('rejete')}
                    />
                    <span>Rejeter / Demander Complément</span>
                  </label>
                </div>

                <textarea
                  rows={2}
                  required
                  value={dgComment}
                  onChange={(e) => setDgComment(e.target.value)}
                  placeholder="Observations obligatoires de la Direction Générale..."
                  className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-xs text-white placeholder:text-white/40"
                />

                <Button type="submit" variant="primary" size="sm" className="w-full justify-center">
                  Consigner la Décision de Direction dans le Journal d'Audit
                </Button>
              </form>
            )}

            {/* Historique décision DG existante */}
            {selectedCase.dg_validation_date && (
              <div className="p-3 bg-slate-50 dark:bg-executive-darkBg rounded-lg border border-slate-200 dark:border-executive-darkBorder text-xs space-y-1">
                <p className="font-bold text-slate-900 dark:text-white">
                  Décision DG constatée le {formatDateTime(selectedCase.dg_validation_date)} :
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Par : <strong>{selectedCase.dg_validated_by_name}</strong> | Résultat : <strong className="capitalize">{selectedCase.dg_validation_status}</strong>
                </p>
                {selectedCase.dg_notes && (
                  <p className="text-slate-500 italic mt-1">« {selectedCase.dg_notes} »</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
