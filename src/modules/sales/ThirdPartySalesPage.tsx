import React, { useState } from 'react';
import { Layers, DollarSign, ArrowUpRight, CheckCircle2, Search, Plus, Building } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { ThirdPartySettlement } from '../../types/sales.types';
import {
  getStoredData,
  INITIAL_SETTLEMENTS,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { formatCurrency, formatDate } from '../../lib/utils';

export const ThirdPartySalesPage: React.FC = () => {
  const { currentUser, hasRole } = useAuth();

  const [settlements, setSettlements] = useState<ThirdPartySettlement[]>(() =>
    getStoredData<ThirdPartySettlement[]>(STORAGE_KEYS.THIRD_PARTY_SETTLEMENTS, INITIAL_SETTLEMENTS)
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSettlement, setSelectedSettlement] = useState<ThirdPartySettlement | null>(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);

  // Formulaire de reversement
  const [reversalAmount, setReversalAmount] = useState<number>(0);
  const [reversalProof, setReversalProof] = useState('');

  const canManageFinance = hasRole(['directeur_general', 'super_admin']);

  const totalOwnerDues = settlements.reduce((sum, s) => sum + s.owner_base_amount, 0);
  const totalOwnerPaid = settlements.reduce((sum, s) => sum + s.amount_paid_to_owner, 0);
  const totalOwnerPending = settlements.reduce((sum, s) => sum + s.balance_due_to_owner, 0);
  const totalCompanyMargin = settlements.reduce((sum, s) => sum + s.company_commission, 0);

  const handlePayOwner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSettlement || reversalAmount <= 0) return;

    if (reversalAmount > selectedSettlement.balance_due_to_owner) {
      alert('Le montant du reversement ne peut pas excéder le solde restant dû au propriétaire.');
      return;
    }

    const newPaid = selectedSettlement.amount_paid_to_owner + reversalAmount;
    const newBalance = selectedSettlement.owner_base_amount - newPaid;

    const updated = settlements.map((s) => {
      if (s.id === selectedSettlement.id) {
        return {
          ...s,
          amount_paid_to_owner: newPaid,
          balance_due_to_owner: newBalance,
          status: newBalance === 0 ? ('solde' as const) : ('partiellement_paye' as const),
          settlement_date: new Date().toISOString().split('T')[0],
          payment_proof_ref: reversalProof || `REV-${Date.now().toString().slice(-4)}`,
          updated_at: new Date().toISOString(),
        };
      }
      return s;
    });

    setSettlements(updated);
    setStoredData(STORAGE_KEYS.THIRD_PARTY_SETTLEMENTS, updated);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'UPDATE',
      module: 'FINANCE:THIRD_PARTY',
      entity_name: 'third_party_settlements',
      entity_id: selectedSettlement.id,
      old_values: { balance_due: selectedSettlement.balance_due_to_owner },
      new_values: { reversal_paid: reversalAmount, new_balance: newBalance, proof: reversalProof },
    });

    setIsSettlementModalOpen(false);
    setSelectedSettlement(null);
  };

  const filteredSettlements = settlements.filter(
    (s) =>
      s.partner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.plot_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Commercialisation Terrains de Tiers & Suivi Propriétaires
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Gestion contractuelle des mandats, répartition des marges et reversements aux propriétaires fonciers
          </p>
        </div>
      </div>

      {/* Cartes KPI Propriétaires */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Part Due Propriétaires</span>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {formatCurrency(totalOwnerDues)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Base contractuelle mandats</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-emerald-600 uppercase">Reversements Effectués</span>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
              {formatCurrency(totalOwnerPaid)}
            </p>
            <p className="text-[11px] text-emerald-600 mt-0.5">Payés par virement / chèque</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-amber-600 uppercase">Reste Dû aux Propriétaires</span>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">
              {formatCurrency(totalOwnerPending)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Engagements financiers à solder</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-executive-emerald uppercase">Marge Brute BELL-MMS</span>
            <p className="text-xl font-bold text-executive-emerald mt-1">
              {formatCurrency(totalCompanyMargin)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Commissions réelles de l'entreprise</p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau des Mandats & Reversements */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-executive-emerald" />
              Répartition Financière par Vente de Tiers ({filteredSettlements.length})
            </CardTitle>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher propriétaire, lot..."
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
                  <th className="py-3 px-4">Propriétaire Foncier</th>
                  <th className="py-3 px-4">Parcelle</th>
                  <th className="py-3 px-4">Prix de Vente</th>
                  <th className="py-3 px-4">Part Propriétaire</th>
                  <th className="py-3 px-4">Marge BELL</th>
                  <th className="py-3 px-4">Montant Reversé</th>
                  <th className="py-3 px-4">Reste Dû</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                {filteredSettlements.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-executive-emerald">
                      {item.reference}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {item.partner_name}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                      {item.plot_number}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {formatCurrency(item.total_sale_price)}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatCurrency(item.owner_base_amount)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(item.company_commission)}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-600">
                      {formatCurrency(item.amount_paid_to_owner)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-amber-700 dark:text-amber-400">
                      {item.balance_due_to_owner > 0 ? formatCurrency(item.balance_due_to_owner) : 'Soldé'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={item.status === 'solde' ? 'success' : 'warning'}>
                        {item.status === 'solde' ? 'Soldé' : 'Partiel'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.balance_due_to_owner > 0 && canManageFinance && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedSettlement(item);
                            setReversalAmount(item.balance_due_to_owner);
                            setIsSettlementModalOpen(true);
                          }}
                          className="text-[11px] py-1 px-2.5 h-7"
                        >
                          Reverser
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modale d'enregistrement d'un reversement */}
      <Modal
        isOpen={isSettlementModalOpen}
        onClose={() => setIsSettlementModalOpen(false)}
        title={`Enregistrer un Reversement Propriétaire — ${selectedSettlement?.partner_name}`}
        description="Justification comptable et enregistrement du décaissement en faveur du propriétaire foncier."
      >
        <form onSubmit={handlePayOwner} className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-executive-darkBg rounded-lg border border-slate-200 dark:border-executive-darkBorder text-xs space-y-1">
            <p>Parcelle commercialisée : <strong>{selectedSettlement?.plot_number}</strong></p>
            <p>Part totale revenant au propriétaire : <strong>{formatCurrency(selectedSettlement?.owner_base_amount)}</strong></p>
            <p className="font-bold text-amber-700">
              Reste à reverser : {formatCurrency(selectedSettlement?.balance_due_to_owner)}
            </p>
          </div>

          <Input
            label="Montant à Reverser ce jour (FCFA)"
            type="number"
            required
            step="100000"
            value={reversalAmount}
            onChange={(e) => setReversalAmount(parseFloat(e.target.value) || 0)}
          />

          <Input
            label="Référence du Justificatif / Chèque / Virement"
            required
            value={reversalProof}
            onChange={(e) => setReversalProof(e.target.value)}
            placeholder="ex: CHQ-BICEC-004812"
            helperText="Référence bancaire obligatoire pour la traçabilité financière"
          />

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsSettlementModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Confirmer le Reversement
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
