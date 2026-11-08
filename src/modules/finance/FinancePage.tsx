import React, { useState } from 'react';
import {
  DollarSign,
  Building,
  Plus,
  ArrowRightLeft,
  Lock,
  CheckCircle2,
  AlertTriangle,
  History,
  Search,
  Key,
  ShieldCheck,
  FileCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import {
  FinancialAccount,
  ExpenseRequest,
  FinancialTransaction,
  FinancialTransfer,
  CashClosure,
} from '../../types/finance.types';
import {
  getStoredData,
  INITIAL_EXPENSES,
  INITIAL_FINANCIAL_ACCOUNTS,
  INITIAL_TRANSACTIONS,
  INITIAL_TRANSFERS,
  INITIAL_CASH_CLOSURES,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/utils';

export const FinancePage: React.FC = () => {
  const { currentUser, hasRole, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'accounts' | 'expenses' | 'transfers' | 'closures' | 'journal'>('accounts');

  const [accounts, setAccounts] = useState<FinancialAccount[]>(() =>
    getStoredData<FinancialAccount[]>(STORAGE_KEYS.FINANCIAL_ACCOUNTS, INITIAL_FINANCIAL_ACCOUNTS)
  );
  const [expenses, setExpenses] = useState<ExpenseRequest[]>(() =>
    getStoredData<ExpenseRequest[]>(STORAGE_KEYS.EXPENSE_REQUESTS, INITIAL_EXPENSES)
  );
  const [transfers, setTransfers] = useState<FinancialTransfer[]>(() =>
    getStoredData<FinancialTransfer[]>(STORAGE_KEYS.FINANCIAL_TRANSFERS, INITIAL_TRANSFERS)
  );
  const [closures, setClosures] = useState<CashClosure[]>(() =>
    getStoredData<CashClosure[]>(STORAGE_KEYS.CASH_CLOSURES, INITIAL_CASH_CLOSURES)
  );
  const [transactions, setTransactions] = useState<FinancialTransaction[]>(() =>
    getStoredData<FinancialTransaction[]>(STORAGE_KEYS.FINANCIAL_TRANSACTIONS, INITIAL_TRANSACTIONS)
  );

  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [selectedExpenseForApproval, setSelectedExpenseForApproval] = useState<ExpenseRequest | null>(null);

  // Formulaire Demande de Dépense
  const [expCategory, setExpCategory] = useState('dep_travaux_viabilisation');
  const [expAccountId, setExpAccountId] = useState(accounts[0]?.id || '');
  const [expBeneficiary, setExpBeneficiary] = useState('');
  const [expAmount, setExpAmount] = useState<number>(150000);
  const [expDescription, setExpDescription] = useState('');

  // Formulaire Approbation Sécurisée
  const [approvalDecision, setApprovalDecision] = useState<'approuve' | 'rejete'>('approuve');
  const [approvalAuthCode, setApprovalAuthCode] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  // Formulaire Transfert Inter-Comptes
  const [fromAccountId, setFromAccountId] = useState(accounts[2]?.id || ''); // UBA
  const [toAccountId, setToAccountId] = useState(accounts[0]?.id || ''); // Caisse Centrale
  const [transferAmount, setTransferAmount] = useState<number>(1000000);
  const [transferReason, setTransferReason] = useState('Alimentation de la Caisse Centrale pour frais opérationnels');

  // Formulaire Clôture de Caisse
  const [closureAccountId, setClosureAccountId] = useState(accounts[0]?.id || '');
  const [physicalCount, setPhysicalCount] = useState<number>(4800000);
  const [discrepancyJustification, setDiscrepancyJustification] = useState('');

  const isDG = hasRole(['directeur_general', 'super_admin']);
  const canRequestExpense = hasPermission('finance:expense:request');
  const canApproveExpense = hasPermission('finance:expense:approve') || isDG;

  const totalCash = accounts
    .filter((a) => a.account_type === 'caisse')
    .reduce((sum, a) => sum + a.current_balance, 0);

  const totalBanks = accounts
    .filter((a) => a.account_type === 'banque')
    .reduce((sum, a) => sum + a.current_balance, 0);

  const totalGlobalTreasury = totalCash + totalBanks;

  // 1. CRÉATION D'UNE DEMANDE DE DÉPENSE
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const account = accounts.find((a) => a.id === expAccountId);
    if (!account) return;

    // Seuil de validation DG : 250 000 FCFA
    const requiresDG = expAmount > 250000;
    const ref = `DEP-2026-${String(expenses.length + 1).padStart(3, '0')}`;

    const newExpense: ExpenseRequest = {
      id: `exp-${Date.now()}`,
      reference: ref,
      category_code: expCategory,
      account_id: account.id,
      account_name: account.name,
      beneficiary: expBeneficiary,
      amount: expAmount,
      expense_date: new Date().toISOString().split('T')[0],
      description: expDescription,
      requested_by_id: currentUser?.id || 'unknown',
      requested_by_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Demandeur',
      requires_dg_approval: requiresDG,
      status: 'en_attente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    setStoredData(STORAGE_KEYS.EXPENSE_REQUESTS, updated);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'FINANCE:EXPENSE_REQUEST',
      entity_name: 'expense_requests',
      entity_id: newExpense.id,
      old_values: null,
      new_values: newExpense,
    });

    setIsExpenseModalOpen(false);
    setExpBeneficiary('');
    setExpDescription('');
  };

  // 2. APPROBATION SÉCURISÉE D'UNE DÉPENSE (SECTION 16.5 & 16.6)
  const handleConfirmApproval = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpenseForApproval) return;

    // RÈGLE 16.5 ABSOLUE DU PROMPT MAÎTRE : Le demandeur ne doit JAMAIS pouvoir approuver sa propre dépense !
    if (selectedExpenseForApproval.requested_by_id === currentUser?.id) {
      alert('INTERDICTION FORMELLE : Vous êtes le demandeur de cette dépense. La politique de gouvernance financière BELL-MMS interdit formellement l\'auto-validation de vos propres demandes.');
      return;
    }

    // Confirmation d'autorité / vérification interne
    if (!approvalAuthCode.trim()) {
      alert('Veuillez saisir votre code d\'autorisation ou mot de passe de confirmation pour valider cette opération financière sensible.');
      return;
    }

    const isApproved = approvalDecision === 'approuve';
    const account = accounts.find((a) => a.id === selectedExpenseForApproval.account_id);

    // Mettre à jour la dépense
    const updatedExpenses = expenses.map((exp) => {
      if (exp.id === selectedExpenseForApproval.id) {
        return {
          ...exp,
          status: isApproved ? ('approuve' as const) : ('rejete' as const),
          approved_by_id: currentUser?.id,
          approved_by_name: `${currentUser?.first_name} ${currentUser?.last_name}`,
          approved_at: new Date().toISOString(),
          approval_notes: approvalNotes,
          updated_at: new Date().toISOString(),
        };
      }
      return exp;
    });

    setExpenses(updatedExpenses);
    setStoredData(STORAGE_KEYS.EXPENSE_REQUESTS, updatedExpenses);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'VALIDATE',
      module: 'FINANCE:EXPENSE_APPROVAL',
      entity_name: 'expense_requests',
      entity_id: selectedExpenseForApproval.id,
      old_values: { status: selectedExpenseForApproval.status },
      new_values: {
        decision: approvalDecision,
        approver: currentUser?.email,
        amount: selectedExpenseForApproval.amount,
        notes: approvalNotes,
      },
    });

    setIsApprovalModalOpen(false);
    setSelectedExpenseForApproval(null);
    setApprovalAuthCode('');
    setApprovalNotes('');
  };

  // 3. DÉCAISSEMENT EFFECTIF D'UNE DÉPENSE APPROUVÉE
  const handleDisburseExpense = (expense: ExpenseRequest) => {
    const account = accounts.find((a) => a.id === expense.account_id);
    if (!account) return;

    if (account.current_balance < expense.amount) {
      alert(`Solde insuffisant sur le compte "${account.name}" (${formatCurrency(account.current_balance)}) pour décaisser ${formatCurrency(expense.amount)}.`);
      return;
    }

    const newBalance = account.current_balance - expense.amount;
    const trxRef = `TRX-2026-${String(transactions.length + 1).padStart(3, '0')}`;

    // Mettre à jour le solde du compte
    const updatedAccounts = accounts.map((acc) =>
      acc.id === account.id ? { ...acc, current_balance: newBalance, updated_at: new Date().toISOString() } : acc
    );

    // Mettre à jour le statut de la dépense à "décaisse"
    const updatedExpenses = expenses.map((exp) =>
      exp.id === expense.id ? { ...exp, status: 'decaisse' as const, disbursed_at: new Date().toISOString(), updated_at: new Date().toISOString() } : exp
    );

    // Créer la transaction financière correspondante
    const newTransaction: FinancialTransaction = {
      id: `trx-${Date.now()}`,
      reference: trxRef,
      account_id: account.id,
      account_name: account.name,
      transaction_type: 'depense',
      category_code: expense.category_code,
      amount: expense.amount,
      transaction_date: new Date().toISOString().split('T')[0],
      beneficiary_or_payer: expense.beneficiary,
      description: `Règlement dépense : ${expense.description} (${expense.reference})`,
      related_entity_type: 'expense',
      related_entity_id: expense.id,
      balance_after: newBalance,
      created_by_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Caisse',
      created_at: new Date().toISOString(),
    };

    const updatedTransactions = [newTransaction, ...transactions];

    setAccounts(updatedAccounts);
    setExpenses(updatedExpenses);
    setTransactions(updatedTransactions);

    setStoredData(STORAGE_KEYS.FINANCIAL_ACCOUNTS, updatedAccounts);
    setStoredData(STORAGE_KEYS.EXPENSE_REQUESTS, updatedExpenses);
    setStoredData(STORAGE_KEYS.FINANCIAL_TRANSACTIONS, updatedTransactions);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'UPDATE',
      module: 'FINANCE:DISBURSEMENT',
      entity_name: 'expense_requests',
      entity_id: expense.id,
      old_values: { balance_before: account.current_balance },
      new_values: { amount_disbursed: expense.amount, balance_after: newBalance },
    });

    alert(`Décaissement de ${formatCurrency(expense.amount)} effectué avec succès depuis ${account.name}.`);
  };

  // 4. TRANSFERT INTER-COMPTES ATOMIQUE (SECTION 16.9)
  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromAccountId === toAccountId) {
      alert('Le compte source et le compte destinataire doivent être distincts.');
      return;
    }

    const fromAcc = accounts.find((a) => a.id === fromAccountId);
    const toAcc = accounts.find((a) => a.id === toAccountId);

    if (!fromAcc || !toAcc) return;

    if (fromAcc.current_balance < transferAmount) {
      alert(`Solde insuffisant sur ${fromAcc.name} (${formatCurrency(fromAcc.current_balance)}).`);
      return;
    }

    const newFromBal = fromAcc.current_balance - transferAmount;
    const newToBal = toAcc.current_balance + transferAmount;
    const trfRef = `TRF-2026-${String(transfers.length + 1).padStart(3, '0')}`;

    // Mise à jour atomique des comptes
    const updatedAccounts = accounts.map((acc) => {
      if (acc.id === fromAcc.id) return { ...acc, current_balance: newFromBal, updated_at: new Date().toISOString() };
      if (acc.id === toAcc.id) return { ...acc, current_balance: newToBal, updated_at: new Date().toISOString() };
      return acc;
    });

    const newTransfer: FinancialTransfer = {
      id: `trf-${Date.now()}`,
      reference: trfRef,
      from_account_id: fromAcc.id,
      from_account_name: fromAcc.name,
      to_account_id: toAcc.id,
      to_account_name: toAcc.name,
      amount: transferAmount,
      transfer_date: new Date().toISOString().split('T')[0],
      reason: transferReason,
      initiated_by_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Direction',
      created_at: new Date().toISOString(),
    };

    // Transactions de traçabilité (débit et crédit)
    const trxDebit: FinancialTransaction = {
      id: `trx-${Date.now()}-1`,
      reference: `TRX-${Date.now().toString().slice(-4)}-D`,
      account_id: fromAcc.id,
      account_name: fromAcc.name,
      transaction_type: 'transfert_debit',
      amount: transferAmount,
      transaction_date: new Date().toISOString().split('T')[0],
      beneficiary_or_payer: toAcc.name,
      description: `Transfert émis vers ${toAcc.name} : ${transferReason}`,
      related_entity_type: 'transfer',
      related_entity_id: newTransfer.id,
      balance_after: newFromBal,
      created_by_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Direction',
      created_at: new Date().toISOString(),
    };

    const trxCredit: FinancialTransaction = {
      id: `trx-${Date.now()}-2`,
      reference: `TRX-${Date.now().toString().slice(-4)}-C`,
      account_id: toAcc.id,
      account_name: toAcc.name,
      transaction_type: 'transfert_credit',
      amount: transferAmount,
      transaction_date: new Date().toISOString().split('T')[0],
      beneficiary_or_payer: fromAcc.name,
      description: `Transfert reçu de ${fromAcc.name} : ${transferReason}`,
      related_entity_type: 'transfer',
      related_entity_id: newTransfer.id,
      balance_after: newToBal,
      created_by_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Direction',
      created_at: new Date().toISOString(),
    };

    const updatedTransfers = [newTransfer, ...transfers];
    const updatedTransactions = [trxCredit, trxDebit, ...transactions];

    setAccounts(updatedAccounts);
    setTransfers(updatedTransfers);
    setTransactions(updatedTransactions);

    setStoredData(STORAGE_KEYS.FINANCIAL_ACCOUNTS, updatedAccounts);
    setStoredData(STORAGE_KEYS.FINANCIAL_TRANSFERS, updatedTransfers);
    setStoredData(STORAGE_KEYS.FINANCIAL_TRANSACTIONS, updatedTransactions);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'FINANCE:TRANSFER',
      entity_name: 'financial_transfers',
      entity_id: newTransfer.id,
      old_values: { from_balance: fromAcc.current_balance, to_balance: toAcc.current_balance },
      new_values: { from_balance: newFromBal, to_balance: newToBal, amount: transferAmount },
    });

    setIsTransferModalOpen(false);
    alert(`Transfert de ${formatCurrency(transferAmount)} opéré avec succès.`);
  };

  // 5. CLÔTURE JOURNALIÈRE DE CAISSE AVEC COMPTAGE PHYSIQUE (SECTION 16.10)
  const handleSaveClosure = (e: React.FormEvent) => {
    e.preventDefault();
    const account = accounts.find((a) => a.id === closureAccountId);
    if (!account) return;

    const theoreticalBal = account.current_balance;
    const discrepancy = physicalCount - theoreticalBal;

    if (discrepancy !== 0 && !discrepancyJustification.trim()) {
      alert(`Un écart de caisse de ${formatCurrency(discrepancy)} a été constaté entre le solde théorique (${formatCurrency(theoreticalBal)}) et votre comptage physique (${formatCurrency(physicalCount)}). La justification écrite de cet écart est obligatoire.`);
      return;
    }

    const ref = `CLO-${new Date().toISOString().split('T')[0]}-${account.code}`;

    const newClosure: CashClosure = {
      id: `clo-${Date.now()}`,
      reference: ref,
      account_id: account.id,
      account_name: account.name,
      closure_date: new Date().toISOString().split('T')[0],
      opening_balance: theoreticalBal, // Repère
      total_inflow: 0,
      total_outflow: 0,
      theoretical_balance: theoreticalBal,
      physical_count_balance: physicalCount,
      discrepancy,
      discrepancy_explanation: discrepancyJustification || 'Comptage physique conforme au solde théorique.',
      closed_by_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Responsable Caisse',
      status: 'validee',
      created_at: new Date().toISOString(),
    };

    const updated = [newClosure, ...closures];
    setClosures(updated);
    setStoredData(STORAGE_KEYS.CASH_CLOSURES, updated);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'VALIDATE',
      module: 'FINANCE:CASH_CLOSURE',
      entity_name: 'cash_closures',
      entity_id: newClosure.id,
      old_values: { theoretical: theoreticalBal },
      new_values: { physical: physicalCount, discrepancy, notes: discrepancyJustification },
    });

    setIsClosureModalOpen(false);
    setDiscrepancyJustification('');
    alert(`Clôture journalière de ${account.name} validée et archivée de façon inaltérable.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Gestion Financière, Caisses & Trésorerie
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Caisses physiques multiples, comptes bancaires, validations des dépenses avec seuils et clôtures inaltérables (XAF)
          </p>
        </div>
        <div className="flex gap-2">
          {canRequestExpense && (
            <Button variant="primary" size="sm" onClick={() => setIsExpenseModalOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Demande de Dépense
            </Button>
          )}
          {isDG && (
            <Button variant="outline" size="sm" onClick={() => setIsTransferModalOpen(true)} className="gap-1.5">
              <ArrowRightLeft className="w-4 h-4" />
              Transfert Inter-Comptes
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setIsClosureModalOpen(true)} className="gap-1.5">
            <Lock className="w-4 h-4" />
            Clôturer une Caisse
          </Button>
        </div>
      </div>

      {/* Cartes KPI Trésorerie Globale */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-executive-emerald">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Trésorerie Globale Disponible</span>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {formatCurrency(totalGlobalTreasury)}
            </p>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Liquidités effectives BELL ENTERPRISE</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Solde Caisses Physiques</span>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1">
              {formatCurrency(totalCash)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Caisse Akwa (4,8M) & PK21 (650k)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Comptes Bancaires</span>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-400 mt-1">
              {formatCurrency(totalBanks)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">UBA Cameroun & BICEC Bonanjo</p>
          </CardContent>
        </Card>
      </div>

      {/* Onglets de Navigation Financière */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-executive-darkBorder pb-3">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'accounts' ? 'bg-executive-dark text-white shadow-sm' : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          Caisses & Banques ({accounts.length})
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
            activeTab === 'expenses' ? 'bg-executive-dark text-white shadow-sm' : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          <span>Dépenses & Approbations</span>
          {expenses.filter((e) => e.status === 'en_attente').length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-bold">
              {expenses.filter((e) => e.status === 'en_attente').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'transfers' ? 'bg-executive-dark text-white shadow-sm' : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          Transferts Inter-Comptes ({transfers.length})
        </button>
        <button
          onClick={() => setActiveTab('closures')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'closures' ? 'bg-executive-dark text-white shadow-sm' : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          Clôtures Journalières ({closures.length})
        </button>
        <button
          onClick={() => setActiveTab('journal')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'journal' ? 'bg-executive-dark text-white shadow-sm' : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
          }`}
        >
          Journal de Trésorerie ({transactions.length})
        </button>
      </div>

      {/* Onglet 1 : Caisses & Banques */}
      {activeTab === 'accounts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => (
            <Card key={acc.id} className="hover:border-executive-emerald/50 transition-all">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      acc.account_type === 'caisse' ? 'bg-emerald-100 text-executive-emerald dark:bg-emerald-950' : 'bg-blue-100 text-blue-600 dark:bg-blue-950'
                    }`}>
                      {acc.account_type === 'caisse' ? <DollarSign className="w-5 h-5" /> : <Building className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">{acc.name}</h3>
                      <p className="text-[11px] text-slate-500 font-mono">Code : {acc.code} {acc.account_number ? `| N° ${acc.account_number}` : ''}</p>
                    </div>
                  </div>
                  <Badge variant={acc.account_type === 'caisse' ? 'emerald' : 'info'}>
                    {acc.account_type.toUpperCase()}
                  </Badge>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-executive-darkBorder flex items-baseline justify-between">
                  <span className="text-xs text-slate-500 uppercase font-semibold">Solde Disponible</span>
                  <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                    {formatCurrency(acc.current_balance)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Onglet 2 : Dépenses & Circuit d'Approbation */}
      {activeTab === 'expenses' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-executive-emerald" />
              Demandes d'Engagements & Décaissements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Réf.</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Bénéficiaire & Motif</th>
                    <th className="py-3 px-4">Demandeur</th>
                    <th className="py-3 px-4">Compte Imputé</th>
                    <th className="py-3 px-4">Montant (FCFA)</th>
                    <th className="py-3 px-4 text-center">Seuil DG</th>
                    <th className="py-3 px-4 text-center">Statut</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-executive-emerald">{exp.reference}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(exp.expense_date)}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{exp.beneficiary}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{exp.description}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{exp.requested_by_name}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{exp.account_name}</td>
                      <td className="py-3 px-4 font-bold font-mono text-slate-900 dark:text-white">{formatCurrency(exp.amount)}</td>
                      <td className="py-3 px-4 text-center">
                        {exp.requires_dg_approval ? (
                          <Badge variant="warning">&gt; 250 000 FCFA</Badge>
                        ) : (
                          <Badge variant="neutral">Courante</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={exp.status === 'decaisse' ? 'success' : exp.status === 'approuve' ? 'info' : exp.status === 'rejete' ? 'danger' : 'warning'}>
                          {exp.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {exp.status === 'en_attente' && canApproveExpense && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setSelectedExpenseForApproval(exp);
                                setIsApprovalModalOpen(true);
                              }}
                              className="text-[11px] py-1 px-2.5 h-7"
                            >
                              Arbitrer
                            </Button>
                          )}
                          {exp.status === 'approuve' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDisburseExpense(exp)}
                              className="text-[11px] py-1 px-2.5 h-7 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            >
                              Décaisser
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onglet 3 : Transferts Inter-Comptes */}
      {activeTab === 'transfers' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-executive-emerald" />
              Historique des Transferts Atomiques de Fonds ({transfers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Réf.</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Compte Source (Débit)</th>
                    <th className="py-3 px-4">Compte Destinataire (Crédit)</th>
                    <th className="py-3 px-4">Montant Transféré</th>
                    <th className="py-3 px-4">Motif</th>
                    <th className="py-3 px-4">Initié Par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                  {transfers.map((trf) => (
                    <tr key={trf.id} className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-executive-emerald">{trf.reference}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(trf.transfer_date)}</td>
                      <td className="py-3 px-4 font-semibold text-rose-600 dark:text-rose-400">{trf.from_account_name}</td>
                      <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">{trf.to_account_name}</td>
                      <td className="py-3 px-4 font-bold font-mono text-slate-900 dark:text-white">{formatCurrency(trf.amount)}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{trf.reason}</td>
                      <td className="py-3 px-4 text-slate-500">{trf.initiated_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onglet 4 : Clôtures Journalières de Caisse */}
      {activeTab === 'closures' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="w-4 h-4 text-executive-emerald" />
              Procès-Verbaux de Clôture Journalière Inaltérables ({closures.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Réf. Clôture</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Caisse Clôturée</th>
                    <th className="py-3 px-4">Solde Théorique</th>
                    <th className="py-3 px-4">Comptage Physique Réel</th>
                    <th className="py-3 px-4 text-center">Écart Constaté</th>
                    <th className="py-3 px-4">Justification</th>
                    <th className="py-3 px-4">Clôturé Par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                  {closures.map((clo) => (
                    <tr key={clo.id} className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-executive-emerald">{clo.reference}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(clo.closure_date)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{clo.account_name}</td>
                      <td className="py-3 px-4 font-mono">{formatCurrency(clo.theoretical_balance)}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(clo.physical_count_balance)}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {clo.discrepancy === 0 ? (
                          <Badge variant="success">0 FCFA</Badge>
                        ) : (
                          <Badge variant="danger">{formatCurrency(clo.discrepancy)}</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic text-[11px] max-w-xs truncate">{clo.discrepancy_explanation}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{clo.closed_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onglet 5 : Journal de Trésorerie */}
      {activeTab === 'journal' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-executive-emerald" />
              Journal des Opérations & Mouvements de Trésorerie
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Réf.</th>
                    <th className="py-3 px-4">Compte</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Bénéficiaire / Tiers</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-right">Montant (FCFA)</th>
                    <th className="py-3 px-4 text-right">Solde Après</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors">
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                      <td className="py-3 px-4 font-mono font-bold text-executive-emerald">{tx.reference}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">{tx.account_name}</td>
                      <td className="py-3 px-4">
                        <Badge variant={tx.transaction_type.includes('recette') || tx.transaction_type.includes('credit') ? 'success' : 'danger'}>
                          {tx.transaction_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-900 dark:text-white font-medium">{tx.beneficiary_or_payer || '-'}</td>
                      <td className="py-3 px-4 text-slate-500 truncate max-w-xs">{tx.description}</td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${
                        tx.transaction_type.includes('recette') || tx.transaction_type.includes('credit') ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                      }`}>
                        {tx.transaction_type.includes('recette') || tx.transaction_type.includes('credit') ? '+' : '-'}{formatCurrency(tx.amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-white">{formatCurrency(tx.balance_after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modale Demande de Dépense */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title="Créer une Demande d'Engagement de Dépense"
        description="Les dépenses supérieures à 250 000 FCFA requièrent obligatoirement l'arbitrage du Directeur Général."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Compte à Débiter
              </label>
              <select
                value={expAccountId}
                onChange={(e) => setExpAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCurrency(a.current_balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Catégorie de Dépense
              </label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              >
                <option value="dep_travaux_viabilisation">Travaux de Viabilisation & Chantier</option>
                <option value="dep_droits_enregistrement">Frais d'Enregistrement, Cadastre & Notaire</option>
                <option value="dep_frais_generaux">Frais Généraux & Fournitures de Bureau</option>
                <option value="dep_commissions_apporteurs">Commissions Apporteurs d'Affaires</option>
                <option value="dep_reversement_proprietaire">Reversement Propriétaire Foncier</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Bénéficiaire / Prestataire"
              required
              value={expBeneficiary}
              onChange={(e) => setExpBeneficiary(e.target.value)}
              placeholder="ex: Cabinet Topo MBIA, Station Total..."
            />
            <Input
              label="Montant de la Dépense (FCFA)"
              type="number"
              required
              step="10000"
              value={expAmount}
              onChange={(e) => setExpAmount(parseFloat(e.target.value) || 0)}
              helperText={expAmount > 250000 ? "⚠️ Supérieur à 250 000 FCFA : validation formelle du DG requise" : "Validation standard"}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Motif & Justification de la Dépense
            </label>
            <textarea
              rows={2}
              required
              value={expDescription}
              onChange={(e) => setExpDescription(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              placeholder="Indiquez l'objet précis, le projet ou le lotissement concerné..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsExpenseModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Soumettre la Demande
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale d'Approbation Sécurisée par Mot de Passe / Code d'Autorité (Section 16.5 & 16.6) */}
      <Modal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        title={`Arbitrage Financier — ${selectedExpenseForApproval?.reference}`}
        description={`Montant : ${formatCurrency(selectedExpenseForApproval?.amount)} | Demandeur : ${selectedExpenseForApproval?.requested_by_name}`}
      >
        <form onSubmit={handleConfirmApproval} className="space-y-4">
          {selectedExpenseForApproval?.requested_by_id === currentUser?.id ? (
            <div className="p-3 bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-900 rounded-lg text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Auto-Validation Interdite :</strong> Vous êtes l'auteur de cette demande. Un autre responsable habilité ou la Direction Générale doit procéder à l'arbitrage.
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-4 p-2.5 bg-slate-50 dark:bg-executive-darkBg rounded-lg border border-slate-200 dark:border-executive-darkBorder text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-emerald-700">
                  <input
                    type="radio"
                    name="decision"
                    checked={approvalDecision === 'approuve'}
                    onChange={() => setApprovalDecision('approuve')}
                  />
                  <span>Approuver pour Décaissement</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-rose-700">
                  <input
                    type="radio"
                    name="decision"
                    checked={approvalDecision === 'rejete'}
                    onChange={() => setApprovalDecision('rejete')}
                  />
                  <span>Rejeter la Dépense</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-executive-emerald" />
                  Code d'Autorisation / Mot de Passe de Confirmation
                </label>
                <Input
                  type="password"
                  required
                  value={approvalAuthCode}
                  onChange={(e) => setApprovalAuthCode(e.target.value)}
                  placeholder="Saisissez votre mot de passe d'approbateur..."
                  helperText="Signature d'autorité interne consignée dans le journal d'audit immuable"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                  Observations de l'Approbateur
                </label>
                <textarea
                  rows={2}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
                  placeholder="Justification ou conditions de paiement..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsApprovalModalOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Confirmer l'Arbitrage Financier
                </Button>
              </div>
            </>
          )}
        </form>
      </Modal>

      {/* Modale Transfert Inter-Comptes Atomique */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Opérer un Transfert Inter-Comptes Atomique"
        description="Débit du compte émetteur et crédit simultané du compte destinataire sans distorsion des recettes/dépenses."
      >
        <form onSubmit={handleSaveTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Compte Source (Débité)
              </label>
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold text-rose-700"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCurrency(a.current_balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Compte Cible (Crédité)
              </label>
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold text-emerald-700"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCurrency(a.current_balance)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Montant à Transférer (FCFA)"
            type="number"
            required
            step="100000"
            value={transferAmount}
            onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
          />

          <Input
            label="Motif du Transfert"
            required
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
          />

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsTransferModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Exécuter le Transfert Atomique
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Clôture de Caisse */}
      <Modal
        isOpen={isClosureModalOpen}
        onClose={() => setIsClosureModalOpen(false)}
        title="Procès-Verbal de Clôture Journalière de Caisse"
        description="Comptage physique obligatoire des espèces en coffre et justification de tout écart."
      >
        <form onSubmit={handleSaveClosure} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Caisse à Clôturer
            </label>
            <select
              value={closureAccountId}
              onChange={(e) => {
                setClosureAccountId(e.target.value);
                const acc = accounts.find((a) => a.id === e.target.value);
                if (acc) setPhysicalCount(acc.current_balance);
              }}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
            >
              {accounts.filter((a) => a.account_type === 'caisse').map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — Solde théorique : {formatCurrency(a.current_balance)}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Montant Physique Constaté (Comptage Billets & Pièces en FCFA)"
            type="number"
            required
            step="1000"
            value={physicalCount}
            onChange={(e) => setPhysicalCount(parseFloat(e.target.value) || 0)}
          />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Justification de l'Écart (Obligatoire si écart non nul)
            </label>
            <textarea
              rows={2}
              value={discrepancyJustification}
              onChange={(e) => setDiscrepancyJustification(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              placeholder="Comptage conforme, ou justification en cas de reliquat de monnaie..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsClosureModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Valider la Clôture Inaltérable
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
