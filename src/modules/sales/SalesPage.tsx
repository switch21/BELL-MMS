import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Clock,
  Plus,
  DollarSign,
  Download,
  AlertTriangle,
  UserCheck,
  Search,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { Client, Plot } from '../../types/land.types';
import {
  Reservation,
  Sale,
  PaymentSchedule,
  Receipt,
  PaymentMethod,
  SaleType,
} from '../../types/sales.types';
import {
  getStoredData,
  INITIAL_CLIENTS,
  INITIAL_PLOTS,
  INITIAL_RECEIPTS,
  INITIAL_RESERVATIONS,
  INITIAL_SALES,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { formatCurrency, formatDate } from '../../lib/utils';
import { generateReceiptPDF } from '../../lib/pdf-generator';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export const SalesPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'sales' | 'reservations'>('sales');

  const [sales, setSales] = useState<Sale[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Sale[]>(STORAGE_KEYS.SALES, INITIAL_SALES)
  );
  const [reservations, setReservations] = useState<Reservation[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Reservation[]>(STORAGE_KEYS.RESERVATIONS, INITIAL_RESERVATIONS)
  );
  const [receipts, setReceipts] = useState<Receipt[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Receipt[]>(STORAGE_KEYS.RECEIPTS, INITIAL_RECEIPTS)
  );
  const [clients, setClients] = useState<Client[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Client[]>(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS)
  );
  const [plots, setPlots] = useState<Plot[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Plot[]>(STORAGE_KEYS.PLOTS, INITIAL_PLOTS)
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedSaleForPayment, setSelectedSaleForPayment] = useState<Sale | null>(null);

  // Formulaire Nouvelle Vente
  const [saleClientId, setSaleClientId] = useState(clients[0]?.id || '');
  const [salePlotId, setSalePlotId] = useState('');
  const [saleType, setSaleType] = useState<SaleType>('comptant');
  const [saleDeposit, setSaleDeposit] = useState<number>(0);
  const [saleInstallmentsCount, setSaleInstallmentsCount] = useState<number>(6);
  const [salePaymentMethod, setSalePaymentMethod] = useState<PaymentMethod>('virement');
  const [saleNotes, setSaleNotes] = useState('');

  // Formulaire Nouvelle Réservation
  const [resClientId, setResClientId] = useState(clients[0]?.id || '');
  const [resPlotId, setResPlotId] = useState('');
  const [resDeposit, setResDeposit] = useState<number>(1000000);
  const [resDurationDays, setResDurationDays] = useState<number>(14);
  const [resNotes, setResNotes] = useState('');

  // Formulaire d'encaissement d'échéance
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('virement');
  const [paymentTxRef, setPaymentTxRef] = useState('');

  const canCreateSale = hasPermission('sales:create');

  const refreshSupabaseData = async () => {
    const [clientsResult, plotsResult, salesResult, reservationsResult, receiptsResult] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('plots').select('*').order('created_at', { ascending: false }),
      supabase.from('sales').select('*, schedules:payment_schedules(*), receipts(*)').order('created_at', { ascending: false }),
      supabase.from('reservations').select('*').order('created_at', { ascending: false }),
      supabase.from('receipts').select('*').order('created_at', { ascending: false }),
    ]);

    for (const result of [clientsResult, plotsResult, salesResult, reservationsResult, receiptsResult]) {
      if (result.error) throw result.error;
    }

    setClients((clientsResult.data ?? []) as Client[]);
    setPlots((plotsResult.data ?? []) as Plot[]);
    setSales((salesResult.data ?? []) as Sale[]);
    setReservations((reservationsResult.data ?? []) as Reservation[]);
    setReceipts((receiptsResult.data ?? []) as Receipt[]);
    setSaleClientId((current) => current || clientsResult.data?.[0]?.id || '');
    setResClientId((current) => current || clientsResult.data?.[0]?.id || '');
    setSalePlotId((current) => current || plotsResult.data?.find((plot) => plot.status === 'disponible')?.id || '');
    setResPlotId((current) => current || plotsResult.data?.find((plot) => plot.status === 'disponible')?.id || '');
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    setIsLoading(true);
    refreshSupabaseData()
      .catch((error: unknown) => {
        console.error('[Supabase] Impossible de charger les ventes :', error);
        if (active) setDataError('Impossible de charger ventes, réservations et parcelles depuis Supabase. Vérifiez les migrations et les droits.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Parcelles disponibles à la vente (ou réservées si transformation)
  const availablePlots = plots.filter((p) => p.status === 'disponible');

  // Calcul des métriques de vente
  const totalSalesVolume = sales.reduce((sum, s) => sum + s.final_price, 0);
  const totalCollected = sales.reduce((sum, s) => sum + (s.final_price - s.remaining_balance), 0);
  const totalPending = sales.reduce((sum, s) => sum + s.remaining_balance, 0);

  // 1. CRÉATION D'UNE NOUVELLE VENTE
  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const plot = plots.find((p) => p.id === salePlotId);
    const client = clients.find((c) => c.id === saleClientId);

    if (!plot || !client) {
      alert('Veuillez sélectionner un client et une parcelle valides.');
      return;
    }

    if (isSupabaseConfigured) {
      setIsSaving(true);
      setDataError(null);
      try {
        const { data, error } = await supabase.rpc('create_sale', {
          p_client_id: client.id,
          p_plot_id: plot.id,
          p_sale_type: saleType,
          p_initial_deposit: saleType === 'comptant' ? plot.total_price : saleDeposit,
          p_payment_method: salePaymentMethod,
          p_installments_count: saleType === 'echelonne' ? saleInstallmentsCount : 0,
          p_reservation_id: null,
          p_notes: saleNotes || null,
        });
        if (error) throw error;
        if (!data) throw new Error('Supabase n’a retourné aucune vente créée.');

        const createdSale = data as Sale;
        await refreshSupabaseData();
        const { data: receiptData, error: receiptError } = await supabase
          .from('receipts')
          .select('*')
          .eq('sale_id', createdSale.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (receiptError) throw receiptError;
        if (receiptData) {
          const createdReceipt = receiptData as Receipt;
          const clientName = client.client_type === 'entreprise'
            ? client.company_name || client.last_name
            : `${client.first_name || ''} ${client.last_name}`;
          generateReceiptPDF(createdReceipt, createdSale, clientName, `${plot.plot_number} (${plot.area_sqm} m²)`);
        }
        setIsSaleModalOpen(false);
        return;
      } catch (error) {
        console.error('[Ventes] Échec de création de la vente :', error);
        setDataError(error instanceof Error ? error.message : 'La création de la vente a échoué.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Sécurité anti-double vente : vérifier que la parcelle n'est pas déjà vendue
    if (plot.status === 'vendue') {
      alert('ERREUR CRITIQUE : Cette parcelle est déjà marquée comme VENDUE. Double vente impossible.');
      return;
    }

    const finalPrice = plot.total_price;
    const initialDeposit = saleType === 'comptant' ? finalPrice : saleDeposit;
    const remainingBalance = finalPrice - initialDeposit;

    const saleRef = `VTE-2026-${String(sales.length + 1).padStart(3, '0')}`;
    const recRef = `REC-2026-${String(receipts.length + 1).padStart(3, '0')}`;

    // Génération automatique des échéanciers si vente échelonnée
    const generatedSchedules: PaymentSchedule[] = [];
    if (saleType === 'echelonne' && remainingBalance > 0) {
      const installmentAmount = Math.round(remainingBalance / saleInstallmentsCount);
      const baseDate = new Date();

      for (let i = 1; i <= saleInstallmentsCount; i++) {
        const dueDate = new Date(baseDate);
        dueDate.setMonth(dueDate.getMonth() + i);

        generatedSchedules.push({
          id: `sch-${Date.now()}-${i}`,
          sale_id: `sale-${Date.now()}`,
          installment_number: i,
          due_date: dueDate.toISOString().split('T')[0],
          due_amount: i === saleInstallmentsCount ? remainingBalance - installmentAmount * (i - 1) : installmentAmount,
          paid_amount: 0,
          status: 'en_attente',
          created_at: new Date().toISOString(),
        });
      }
    }

    const newSale: Sale = {
      id: `sale-${Date.now()}`,
      reference: saleRef,
      client_id: client.id,
      plot_id: plot.id,
      sale_type: saleType,
      sale_date: new Date().toISOString().split('T')[0],
      total_price: finalPrice,
      discount_amount: 0,
      final_price: finalPrice,
      initial_deposit: initialDeposit,
      remaining_balance: remainingBalance,
      payment_method: salePaymentMethod,
      status: remainingBalance === 0 ? 'soldee' : 'en_cours',
      sales_rep_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Commercial',
      schedules: generatedSchedules,
      notes: saleNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Reçu pour l'apport initial
    const newReceipt: Receipt = {
      id: `rec-${Date.now()}`,
      reference: recRef,
      sale_id: newSale.id,
      amount: initialDeposit,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: salePaymentMethod,
      transaction_ref: `VIR-${Date.now().toString().slice(-6)}`,
      received_by_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Caisse',
      notes: saleType === 'comptant' ? 'Règlement total au comptant' : 'Acompte initial de vente échelonnée',
      created_at: new Date().toISOString(),
    };

    // Mettre à jour le statut de la parcelle à "vendue"
    const updatedPlots = plots.map((p) => {
      if (p.id === plot.id) {
        return { ...p, status: 'vendue' as const, updated_at: new Date().toISOString() };
      }
      return p;
    });

    const updatedSales = [newSale, ...sales];
    const updatedReceipts = [newReceipt, ...receipts];

    setPlots(updatedPlots);
    setSales(updatedSales);
    setReceipts(updatedReceipts);

    setStoredData(STORAGE_KEYS.PLOTS, updatedPlots);
    setStoredData(STORAGE_KEYS.SALES, updatedSales);
    setStoredData(STORAGE_KEYS.RECEIPTS, updatedReceipts);

    // Audit log
    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'SALES',
      entity_name: 'sales',
      entity_id: newSale.id,
      old_values: null,
      new_values: { sale: newSale, receipt: newReceipt },
    });

    setIsSaleModalOpen(false);

    // Proposition de génération PDF immédiate du reçu
    const clientName = client.client_type === 'entreprise' ? client.company_name || client.last_name : `${client.first_name || ''} ${client.last_name}`;
    generateReceiptPDF(newReceipt, newSale, clientName, `${plot.plot_number} (${plot.area_sqm} m²)`);
  };

  // 2. CRÉATION D'UNE RÉSERVATION
  const handleSaveReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    const plot = plots.find((p) => p.id === resPlotId);
    const client = clients.find((c) => c.id === resClientId);

    if (!plot || !client) {
      alert('Veuillez sélectionner un client et une parcelle.');
      return;
    }

    if (isSupabaseConfigured) {
      setIsSaving(true);
      setDataError(null);
      try {
        const { error } = await supabase.rpc('create_reservation', {
          p_client_id: client.id,
          p_plot_id: plot.id,
          p_deposit_amount: resDeposit,
          p_duration_days: resDurationDays,
          p_notes: resNotes || null,
        });
        if (error) throw error;
        await refreshSupabaseData();
        setIsReservationModalOpen(false);
      } catch (error) {
        console.error('[Ventes] Échec de création de la réservation :', error);
        setDataError(error instanceof Error ? error.message : 'La création de la réservation a échoué.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (plot.status !== 'disponible') {
      alert(`Impossible de réserver la parcelle "${plot.plot_number}" car son statut est actuellement "${plot.status}".`);
      return;
    }

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + resDurationDays);

    const newRes: Reservation = {
      id: `res-${Date.now()}`,
      reference: `RES-2026-${String(reservations.length + 1).padStart(3, '0')}`,
      client_id: client.id,
      plot_id: plot.id,
      agreed_price: plot.total_price,
      deposit_amount: resDeposit,
      reservation_date: new Date().toISOString().split('T')[0],
      duration_days: resDurationDays,
      expiration_date: expDate.toISOString().split('T')[0],
      status: 'active',
      sales_rep_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Commercial',
      notes: resNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Marquer la parcelle comme réservée
    const updatedPlots = plots.map((p) => {
      if (p.id === plot.id) {
        return { ...p, status: 'reservee' as const, updated_at: new Date().toISOString() };
      }
      return p;
    });

    const updatedRes = [newRes, ...reservations];
    setPlots(updatedPlots);
    setReservations(updatedRes);

    setStoredData(STORAGE_KEYS.PLOTS, updatedPlots);
    setStoredData(STORAGE_KEYS.RESERVATIONS, updatedRes);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'SALES',
      entity_name: 'reservations',
      entity_id: newRes.id,
      old_values: null,
      new_values: newRes,
    });

    setIsReservationModalOpen(false);
  };

  // 3. ENCAISSEMENT D'UNE ÉCHÉANCE
  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForPayment || paymentAmount <= 0) return;

    if (paymentAmount > selectedSaleForPayment.remaining_balance) {
      alert('Le montant versé ne peut pas dépasser le solde restant dû.');
      return;
    }

    if (isSupabaseConfigured) {
      setIsSaving(true);
      setDataError(null);
      try {
        const { data, error } = await supabase.rpc('collect_sale_payment', {
          p_sale_id: selectedSaleForPayment.id,
          p_amount: paymentAmount,
          p_payment_method: paymentMethod,
          p_transaction_ref: paymentTxRef || null,
          p_notes: 'Paiement d’échéance contractuelle',
        });
        if (error) throw error;
        if (!data) throw new Error('Supabase n’a retourné aucun reçu.');

        const createdReceipt = data as Receipt;
        const saleBeforePayment = selectedSaleForPayment;
        const newRemaining = saleBeforePayment.remaining_balance - paymentAmount;
        await refreshSupabaseData();
        const client = clients.find((item) => item.id === saleBeforePayment.client_id);
        const plot = plots.find((item) => item.id === saleBeforePayment.plot_id);
        const clientName = client?.client_type === 'entreprise'
          ? client.company_name || client.last_name
          : `${client?.first_name || ''} ${client?.last_name || ''}`;
        generateReceiptPDF(
          createdReceipt,
          { ...saleBeforePayment, remaining_balance: newRemaining },
          clientName,
          plot?.plot_number || 'Parcelle'
        );
        setIsPaymentModalOpen(false);
        setSelectedSaleForPayment(null);
      } catch (error) {
        console.error('[Ventes] Échec d’encaissement :', error);
        setDataError(error instanceof Error ? error.message : 'L’encaissement a échoué.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const newRemaining = selectedSaleForPayment.remaining_balance - paymentAmount;
    const recRef = `REC-2026-${String(receipts.length + 1).padStart(3, '0')}`;

    const newReceipt: Receipt = {
      id: `rec-${Date.now()}`,
      reference: recRef,
      sale_id: selectedSaleForPayment.id,
      amount: paymentAmount,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: paymentMethod,
      transaction_ref: paymentTxRef || `REG-${Date.now().toString().slice(-4)}`,
      received_by_name: currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Caisse',
      notes: 'Paiement d\'échéance contractuelle',
      created_at: new Date().toISOString(),
    };

    const updatedSales = sales.map((s) => {
      if (s.id === selectedSaleForPayment.id) {
        return {
          ...s,
          remaining_balance: newRemaining,
          status: newRemaining === 0 ? ('soldee' as const) : s.status,
          updated_at: new Date().toISOString(),
        };
      }
      return s;
    });

    const updatedReceipts = [newReceipt, ...receipts];

    setSales(updatedSales);
    setReceipts(updatedReceipts);
    setStoredData(STORAGE_KEYS.SALES, updatedSales);
    setStoredData(STORAGE_KEYS.RECEIPTS, updatedReceipts);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'FINANCE',
      entity_name: 'receipts',
      entity_id: newReceipt.id,
      old_values: { remaining_before: selectedSaleForPayment.remaining_balance },
      new_values: { amount_collected: paymentAmount, remaining_after: newRemaining },
    });

    setIsPaymentModalOpen(false);
    setSelectedSaleForPayment(null);

    // Téléchargement du reçu PDF
    const client = clients.find((c) => c.id === selectedSaleForPayment.client_id);
    const plot = plots.find((p) => p.id === selectedSaleForPayment.plot_id);
    const clientName = client?.client_type === 'entreprise' ? client.company_name || client.last_name : `${client?.first_name || ''} ${client?.last_name || ''}`;
    generateReceiptPDF(newReceipt, { ...selectedSaleForPayment, remaining_balance: newRemaining }, clientName, plot?.plot_number || 'Parcelle');
  };

  const filteredSales = sales.filter((s) => {
    const client = clients.find((c) => c.id === s.client_id);
    const plot = plots.find((p) => p.id === s.plot_id);
    const term = searchTerm.toLowerCase();
    return (
      s.reference.toLowerCase().includes(term) ||
      client?.last_name.toLowerCase().includes(term) ||
      client?.company_name?.toLowerCase().includes(term) ||
      plot?.plot_number.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Réservations, Ventes & Échéanciers
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Commercialisation de parcelles, contrats comptant et échelonnés, génération des reçus PDF (XAF)
          </p>
        </div>
        {canCreateSale && (
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsSaleModalOpen(true)}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nouvelle Vente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReservationModalOpen(true)}
              className="gap-1.5"
            >
              <Clock className="w-4 h-4" />
              Nouvelle Réservation
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
          Chargement des ventes, réservations et parcelles…
        </p>
      )}

      {/* Cartes KPI Financières & Commerciales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-slate-500 uppercase">Volume Global des Ventes</span>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {formatCurrency(totalSalesVolume)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">{sales.length} dossiers de vente formalisés</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-emerald-600 uppercase">Montants Réellement Encaissés</span>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
              {formatCurrency(totalCollected)}
            </p>
            <p className="text-[11px] text-emerald-600 mt-0.5">Trésorerie effective disponible</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-amber-600 uppercase">Créances Restantes à Recouvrer</span>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">
              {formatCurrency(totalPending)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Sur ventes à tempérament</p>
          </CardContent>
        </Card>
      </div>

      {/* Onglets & Recherche */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-executive-darkBorder pb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'sales'
                ? 'bg-executive-dark text-white shadow-sm'
                : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            Ventes Immobilières ({sales.length})
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'reservations'
                ? 'bg-executive-dark text-white shadow-sm'
                : 'bg-white dark:bg-executive-darkSurface text-slate-600 dark:text-slate-300 hover:bg-slate-100'
            }`}
          >
            Réservations en Cours ({reservations.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher référence, client, lot..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-executive-darkSurface border border-slate-200 dark:border-executive-darkBorder rounded-lg text-xs outline-none focus:ring-2 focus:ring-executive-emerald"
          />
        </div>
      </div>

      {/* Vue Onglet Ventes */}
      {activeTab === 'sales' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-executive-emerald" />
              Contrats de Vente et Suivi des Règlements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Réf. Vente</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Client Acquéreur</th>
                    <th className="py-3 px-4">Parcelle (Lot)</th>
                    <th className="py-3 px-4">Type de Vente</th>
                    <th className="py-3 px-4">Prix Total</th>
                    <th className="py-3 px-4">Solde Dû</th>
                    <th className="py-3 px-4 text-center">Statut</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                  {filteredSales.map((sale) => {
                    const client = clients.find((c) => c.id === sale.client_id);
                    const plot = plots.find((p) => p.id === sale.plot_id);
                    const clientName = client?.client_type === 'entreprise' ? client.company_name || client.last_name : `${client?.first_name || ''} ${client?.last_name || ''}`;

                    return (
                      <tr
                        key={sale.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-executive-emerald">
                          {sale.reference}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {formatDate(sale.sale_date)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          {clientName}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {plot?.plot_number} ({plot?.area_sqm} m²)
                        </td>
                        <td className="py-3 px-4 capitalize">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            sale.sale_type === 'comptant' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {sale.sale_type === 'comptant' ? 'Au Comptant' : 'Échelonné'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold">
                          {formatCurrency(sale.final_price)}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-amber-700 dark:text-amber-400">
                          {sale.remaining_balance > 0 ? formatCurrency(sale.remaining_balance) : 'Soldé'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={sale.status === 'soldee' ? 'success' : 'warning'}>
                            {sale.status === 'soldee' ? 'Soldée' : 'En cours'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {sale.remaining_balance > 0 && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  setSelectedSaleForPayment(sale);
                                  setPaymentAmount(Math.min(sale.remaining_balance, Math.round(sale.remaining_balance / 2)));
                                  setIsPaymentModalOpen(true);
                                }}
                                className="text-[11px] py-1 px-2 h-7"
                              >
                                Encaisser
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const saleReceipt = receipts.find((r) => r.sale_id === sale.id);
                                if (saleReceipt) {
                                  generateReceiptPDF(saleReceipt, sale, clientName, `${plot?.plot_number} (${plot?.area_sqm} m²)`);
                                } else {
                                  alert('Aucun reçu initial trouvé pour cette vente.');
                                }
                              }}
                              className="text-[11px] py-1 px-2 h-7"
                              title="Télécharger Reçu PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vue Onglet Réservations */}
      {activeTab === 'reservations' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-executive-emerald" />
              Réservations Actives & Délais de Péremption
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                    <th className="py-3 px-4">Réf.</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Parcelle (Lot)</th>
                    <th className="py-3 px-4">Prix Convenu</th>
                    <th className="py-3 px-4">Acompte Versé</th>
                    <th className="py-3 px-4">Date Réservation</th>
                    <th className="py-3 px-4">Date d'Expiration</th>
                    <th className="py-3 px-4 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                  {reservations.map((res) => {
                    const client = clients.find((c) => c.id === res.client_id);
                    const plot = plots.find((p) => p.id === res.plot_id);
                    return (
                      <tr
                        key={res.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-amber-600">
                          {res.reference}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          {client?.last_name} {client?.first_name}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                          {plot?.plot_number}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {formatCurrency(res.agreed_price)}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-700">
                          {formatCurrency(res.deposit_amount)}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {formatDate(res.reservation_date)}
                        </td>
                        <td className="py-3 px-4 text-amber-700 font-semibold font-mono">
                          {formatDate(res.expiration_date)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="warning">{res.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modale de création d'une vente */}
      <Modal
        isOpen={isSaleModalOpen}
        onClose={() => setIsSaleModalOpen(false)}
        title="Enregistrer une Vente Immobilière"
        description="Formalisation de contrat au comptant ou échelonné avec émission immédiate du reçu officiel."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveSale} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Client Acquéreur
              </label>
              <select
                value={saleClientId}
                onChange={(e) => setSaleClientId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.client_type === 'entreprise' ? c.company_name : `${c.first_name || ''} ${c.last_name}`} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Parcelle Disponible (Lot)
              </label>
              <select
                required
                value={salePlotId}
                onChange={(e) => setSalePlotId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
              >
                <option value="">Sélectionner une parcelle libre...</option>
                {availablePlots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.plot_number} — {p.area_sqm} m² ({formatCurrency(p.total_price)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-4 p-2 bg-slate-50 dark:bg-executive-darkBg rounded-lg border border-slate-200 dark:border-executive-darkBorder text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="saleType"
                checked={saleType === 'comptant'}
                onChange={() => setSaleType('comptant')}
                className="text-executive-emerald focus:ring-executive-emerald"
              />
              <span className="font-semibold">Vente au Comptant (100% à la signature)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="saleType"
                checked={saleType === 'echelonne'}
                onChange={() => setSaleType('echelonne')}
                className="text-executive-emerald focus:ring-executive-emerald"
              />
              <span className="font-semibold">Vente Échelonnée (Échéancier)</span>
            </label>
          </div>

          {saleType === 'echelonne' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
              <Input
                label="Apport Initial / Acompte (FCFA)"
                type="number"
                required
                step="500000"
                value={saleDeposit}
                onChange={(e) => setSaleDeposit(parseFloat(e.target.value) || 0)}
              />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                  Nombre d'Échéances Mensuelles
                </label>
                <select
                  value={saleInstallmentsCount}
                  onChange={(e) => setSaleInstallmentsCount(parseInt(e.target.value) || 6)}
                  className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
                >
                  <option value={3}>3 mois (Trimestriel)</option>
                  <option value={6}>6 mois</option>
                  <option value={12}>12 mois (1 an)</option>
                  <option value={18}>18 mois</option>
                  <option value={24}>24 mois (2 ans)</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Mode de Règlement Constaté
            </label>
            <select
              value={salePaymentMethod}
              onChange={(e) => setSalePaymentMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
            >
              <option value="virement">Virement Bancaire (UBA / BICEC / Afriland)</option>
              <option value="cheque">Chèque Certifié de Banque</option>
              <option value="versement_bancaire">Bordereau de Versement Espèces en Banque</option>
              <option value="especes">Versement Espèces à la Caisse Centrale</option>
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsSaleModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
              Valider la Vente & Émettre le Reçu PDF
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale de Réservation */}
      <Modal
        isOpen={isReservationModalOpen}
        onClose={() => setIsReservationModalOpen(false)}
        title="Créer une Réservation de Parcelle"
        description="Verrouille temporairement le lot pour empêcher toute double attribution."
      >
        <form onSubmit={handleSaveReservation} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Client
            </label>
            <select
              value={resClientId}
              onChange={(e) => setResClientId(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.last_name} {c.first_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Parcelle à Réserver
            </label>
            <select
              required
              value={resPlotId}
              onChange={(e) => setResPlotId(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
            >
              <option value="">Choisir une parcelle libre...</option>
              {availablePlots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plot_number} — {p.area_sqm} m² ({formatCurrency(p.total_price)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Montant Acompte Versé (FCFA)"
              type="number"
              value={resDeposit}
              onChange={(e) => setResDeposit(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Durée de Réservation (Jours)"
              type="number"
              value={resDurationDays}
              onChange={(e) => setResDurationDays(parseInt(e.target.value) || 14)}
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsReservationModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
              Confirmer la Réservation
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale d'Encaissement d'une Échéance */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Encaisser un Versement — Dossier ${selectedSaleForPayment?.reference}`}
        description="Enregistre le paiement, met à jour le solde et télécharge le reçu PDF."
      >
        <form onSubmit={handleCollectPayment} className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-executive-darkBg rounded-lg border border-slate-200 dark:border-executive-darkBorder text-xs space-y-1">
            <p>Prix total du contrat : <strong>{formatCurrency(selectedSaleForPayment?.final_price)}</strong></p>
            <p className="font-bold text-amber-700">
              Solde restant à recouvrer : {formatCurrency(selectedSaleForPayment?.remaining_balance)}
            </p>
          </div>

          <Input
            label="Montant Versé ce jour (FCFA)"
            type="number"
            required
            step="100000"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Mode de Règlement
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              >
                <option value="virement">Virement Bancaire</option>
                <option value="cheque">Chèque</option>
                <option value="versement_bancaire">Versement Bordereau</option>
                <option value="especes">Espèces Caisse</option>
              </select>
            </div>
            <Input
              label="Réf. Transaction / Chèque"
              value={paymentTxRef}
              onChange={(e) => setPaymentTxRef(e.target.value)}
              placeholder="ex: VIR-992182"
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsPaymentModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
              Encaisser & Télécharger le Reçu PDF
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
