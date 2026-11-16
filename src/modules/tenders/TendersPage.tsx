import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CalendarClock,
  FileCheck2,
  FilePlus2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { AuditLogEntry, UserProfile } from '../../types/auth.types';
import {
  DOC_NEXT_STATUS,
  NEXT_SERVICE_ORDER_STATUS,
  NEXT_TENDER_STATUS,
  SERVICE_ORDER_STATUS_LABELS,
  SERVICE_ORDER_TYPE_LABELS,
  TENDER_DOC_CATEGORY_LABELS,
  TENDER_DOC_STATUS_LABELS,
  TENDER_DOCS_CANVAS,
  TENDER_METHOD_LABELS,
  TENDER_STATUS_LABELS,
  TenderDocStatus,
  TenderMethod,
  ServiceOrderStatus,
  ServiceOrderType,
  Tender,
  TenderDocCategory,
  TenderDocument,
  TenderServiceOrder,
  TenderStatus,
  deadlineWithinDays,
  isTenderOverdue,
} from '../../types/tender.types';
import {
  getStoredData,
  INITIAL_TENDERS,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const REFERENCE_YEAR = new Date().getFullYear();

const buildReference = (prefix: string) =>
  `${prefix}-${REFERENCE_YEAR}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const ORDER_PREFIX: Record<ServiceOrderType, string> = {
  ordre_service: 'OS',
  avenant: 'AVN',
  decompte: 'DEC',
};

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
};

const formatAmount = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('fr-FR')} FCFA`;
};

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_ORDER: TenderStatus[] = [
  'veille',
  'candidature',
  'soumission',
  'adjudique',
  'en_execution',
  'cloture',
  'sans_suite',
  'abandonne',
];

type BadgeVariant = 'emerald' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TENDER_BADGE: Record<TenderStatus, BadgeVariant> = {
  veille: 'neutral',
  candidature: 'info',
  soumission: 'info',
  adjudique: 'emerald',
  sans_suite: 'neutral',
  abandonne: 'neutral',
  en_execution: 'warning',
  cloture: 'success',
};

const DOC_BADGE: Record<TenderDocStatus, BadgeVariant> = {
  a_obtenir: 'neutral',
  en_cours: 'info',
  obtenu: 'success',
  valide: 'emerald',
  rejete: 'danger',
};

const ORDER_BADGE: Record<ServiceOrderStatus, BadgeVariant> = {
  emis: 'neutral',
  notifie: 'info',
  facture: 'warning',
  paye: 'emerald',
  refuse: 'danger',
};

const selectClass =
  'w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs';

const fieldLabel =
  'block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5';

// Une piece qui monte en statut se date du jour : c'est la preuve de validite du dossier.
const applyDocAdvance = (
  documents: TenderDocument[],
  docId: string,
  next: TenderDocStatus,
  actorId: string | null,
  actorName: string | null,
  now: string
): TenderDocument[] =>
  documents.map((doc) => {
    if (doc.id !== docId) return doc;
    return {
      ...doc,
      status: next,
      obtained_at: next === 'obtenu' || next === 'valide' ? today() : doc.obtained_at,
      updated_at: now,
      created_by: doc.created_by ?? actorId,
      created_by_name: doc.created_by_name ?? actorName,
    };
  });

const buildCanvas = (tenderId: string, actorId: string | null, actorName: string | null, now: string) =>
  TENDER_DOCS_CANVAS.map((piece) => ({
    tender_id: tenderId,
    title: piece.title,
    category: piece.category,
    status: 'a_obtenir' as TenderDocStatus,
    obtained_at: null,
    valid_until: null,
    notes: null,
    created_by: actorId,
    created_by_name: actorName,
    created_at: now,
    updated_at: now,
  }));

export const TendersPage: React.FC = () => {
  const { currentUser, hasPermission, hasRole, usersList } = useAuth();

  const [tenders, setTenders] = useState<Tender[]>(() =>
    isSupabaseConfigured ? [] : getStoredData<Tender[]>(STORAGE_KEYS.TENDERS, INITIAL_TENDERS)
  );
  const [collaborators, setCollaborators] = useState<UserProfile[]>(() =>
    isSupabaseConfigured ? [] : usersList
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TenderStatus>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | TenderMethod>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyDeadline, setOnlyDeadline] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tender | null>(null);
  const [title, setTitle] = useState('');
  const [authority, setAuthority] = useState('');
  const [source, setSource] = useState('');
  const [method, setMethod] = useState<TenderMethod>('appel_offres');
  const [status, setStatus] = useState<TenderStatus>('veille');
  const [estimatedAmount, setEstimatedAmount] = useState('');
  const [cautionAmount, setCautionAmount] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [awardedAt, setAwardedAt] = useState('');
  const [contractSignedAt, setContractSignedAt] = useState('');
  const [advanceRate, setAdvanceRate] = useState('');
  const [publicationDate, setPublicationDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [executionDelay, setExecutionDelay] = useState('');
  const [siteLocation, setSiteLocation] = useState('');
  const [assignee, setAssignee] = useState('');
  const [notes, setNotes] = useState('');

  const [detailTender, setDetailTender] = useState<Tender | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<TenderDocCategory>('administratif');
  const [orderType, setOrderType] = useState<ServiceOrderType>('ordre_service');
  const [orderTitle, setOrderTitle] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [orderDate, setOrderDate] = useState(today());

  const canManage = hasPermission('tenders:manage');
  const canDelete = hasRole(['directeur_general', 'super_admin']);

  const displayName = (user?: UserProfile | null) =>
    user ? `${user.first_name} ${user.last_name}`.trim() : 'Non affecté';

  const numericOrNull = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/\s/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const mergeChildren = (
    rows: Tender[],
    documents: TenderDocument[],
    orders: TenderServiceOrder[]
  ): Tender[] =>
    rows.map((tender) => ({
      ...tender,
      documents: documents.filter((doc) => doc.tender_id === tender.id),
      service_orders: orders
        .filter((order) => order.tender_id === tender.id)
        .sort((a, b) => (a.issued_on ?? '').localeCompare(b.issued_on ?? '')),
    }));

  const loadConnectedData = async () => {
    const [tendersResult, docsResult, ordersResult, profilesResult] = await Promise.all([
      supabase.from('tenders').select('*').order('created_at', { ascending: false }),
      supabase.from('tender_documents').select('*').order('created_at'),
      supabase.from('tender_service_orders').select('*').order('issued_on'),
      supabase.from('profiles').select('*').order('last_name'),
    ]);

    if (tendersResult.error) throw tendersResult.error;
    if (docsResult.error) throw docsResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const merged = mergeChildren(
      (tendersResult.data ?? []) as Tender[],
      (docsResult.data ?? []) as TenderDocument[],
      (ordersResult.data ?? []) as TenderServiceOrder[]
    );
    setTenders(merged);
    setCollaborators((profilesResult.data ?? []) as UserProfile[]);
    return merged;
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    setIsLoading(true);
    loadConnectedData()
      .catch((error: unknown) => {
        console.error('[Marchés publics] Chargement impossible :', error);
        if (active) {
          setDataError(
            'Impossible de charger les marchés publics depuis Supabase. Vérifiez la connexion, la migration 026 et vos droits.'
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleTenders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return tenders.filter((tender) => {
      if (statusFilter !== 'all' && tender.status !== statusFilter) return false;
      if (methodFilter !== 'all' && tender.tender_method !== methodFilter) return false;
      if (onlyMine && tender.assigned_to !== currentUser?.id) return false;
      if (onlyDeadline && !deadlineWithinDays(tender, 15) && !isTenderOverdue(tender)) return false;
      if (!term) return true;
      return (
        tender.title.toLowerCase().includes(term) ||
        (tender.reference ?? '').toLowerCase().includes(term) ||
        (tender.contracting_authority ?? '').toLowerCase().includes(term) ||
        (tender.contract_number ?? '').toLowerCase().includes(term) ||
        (tender.assigned_to_name ?? '').toLowerCase().includes(term)
      );
    });
  }, [tenders, statusFilter, methodFilter, onlyMine, onlyDeadline, searchTerm, currentUser?.id]);

  const watchingCount = useMemo(() => tenders.filter((tender) => tender.status === 'veille').length, [tenders]);
  const wonCount = useMemo(
    () => tenders.filter((tender) => tender.status === 'adjudique' || tender.status === 'en_execution').length,
    [tenders]
  );
  const atRiskCount = useMemo(
    () => tenders.filter((tender) => deadlineWithinDays(tender, 15) || isTenderOverdue(tender)).length,
    [tenders]
  );
  const offeredTotal = useMemo(
    () =>
      tenders.reduce(
        (sum, tender) =>
          tender.status === 'sans_suite' || tender.status === 'abandonne' ? sum : sum + Number(tender.bid_amount ?? 0),
        0
      ),
    [tenders]
  );

  const logAudit = (entry: {
    action: AuditLogEntry['action'];
    entityName: string;
    entityId: string;
    oldValue: AuditLogEntry['old_values'];
    newValue: AuditLogEntry['new_values'];
  }) => {
    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: entry.action,
      module: 'TENDERS',
      entity_name: entry.entityName,
      entity_id: entry.entityId,
      old_values: entry.oldValue,
      new_values: entry.newValue,
    });
  };

  const persistDemo = (
    updated: Tender[],
    entityName: string,
    action: AuditLogEntry['action'],
    entityId: string,
    oldValue: AuditLogEntry['old_values'],
    newValue: AuditLogEntry['new_values']
  ) => {
    setTenders(updated);
    setStoredData(STORAGE_KEYS.TENDERS, updated);
    logAudit({ action, entityName, entityId, oldValue, newValue });
  };

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setAuthority('');
    setSource('');
    setMethod('appel_offres');
    setStatus('veille');
    setEstimatedAmount('');
    setCautionAmount('');
    setBidAmount('');
    setContractNumber('');
    setAwardedAt('');
    setContractSignedAt('');
    setAdvanceRate('');
    setPublicationDate('');
    setDeadline('');
    setExecutionDelay('');
    setSiteLocation('');
    setAssignee(currentUser?.id ?? '');
    setNotes('');
  };

  const openForm = (tender?: Tender) => {
    setDataError(null);
    if (tender) {
      setEditing(tender);
      setTitle(tender.title);
      setAuthority(tender.contracting_authority ?? '');
      setSource(tender.source ?? '');
      setMethod(tender.tender_method);
      setStatus(tender.status);
      setEstimatedAmount(tender.estimated_amount?.toString() ?? '');
      setCautionAmount(tender.caution_amount?.toString() ?? '');
      setBidAmount(tender.bid_amount?.toString() ?? '');
      setContractNumber(tender.contract_number ?? '');
      setAwardedAt(tender.awarded_at ?? '');
      setContractSignedAt(tender.contract_signed_at ?? '');
      setAdvanceRate(tender.advance_payment_rate?.toString() ?? '');
      setPublicationDate(tender.publication_date ?? '');
      setDeadline(tender.deadline ?? '');
      setExecutionDelay(tender.execution_delay_days?.toString() ?? '');
      setSiteLocation(tender.site_location ?? '');
      setAssignee(tender.assigned_to ?? '');
      setNotes(tender.notes ?? '');
    } else {
      resetForm();
    }
    setIsFormOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setDataError(null);

    if (publicationDate && deadline && new Date(deadline) < new Date(publicationDate)) {
      setDataError('La date limite de dépôt ne peut pas précéder la publication de l’avis.');
      return;
    }

    setIsSaving(true);
    const person = collaborators.find((user) => user.id === assignee) || null;
    const actor = currentUser ? displayName(currentUser) : null;
    const now = new Date().toISOString();
    const payload = {
      title,
      contracting_authority: authority || null,
      source: source || null,
      tender_method: method,
      status,
      estimated_amount: numericOrNull(estimatedAmount),
      caution_amount: numericOrNull(cautionAmount),
      bid_amount: numericOrNull(bidAmount),
      contract_number: contractNumber || null,
      awarded_at: awardedAt || null,
      contract_signed_at: contractSignedAt || null,
      advance_payment_rate: numericOrNull(advanceRate),
      publication_date: publicationDate || null,
      deadline: deadline || null,
      execution_delay_days: numericOrNull(executionDelay),
      site_location: siteLocation || null,
      assigned_to: assignee || null,
      assigned_to_name: person ? displayName(person) : null,
      notes: notes || null,
      updated_at: now,
    };

    try {
      if (isSupabaseConfigured) {
        if (editing) {
          const { error } = await supabase.from('tenders').update(payload).eq('id', editing.id);
          if (error) throw error;
        } else {
          const { data: created, error } = await supabase
            .from('tenders')
            .insert({
              ...payload,
              reference: buildReference('AOO'),
              created_by: currentUser?.id ?? null,
              created_by_name: actor,
            })
            .select('*');
          if (error) throw error;

          const tender = (created ?? [])[0] as Tender | undefined;
          if (tender) {
            const { error: docsError } = await supabase
              .from('tender_documents')
              .insert(buildCanvas(tender.id, currentUser?.id ?? null, actor, now));
            if (docsError) throw docsError;
          }
        }
        await loadConnectedData();
      } else {
        let saved: Tender;
        let updated: Tender[];
        if (editing) {
          saved = { ...editing, ...payload } as Tender;
          updated = tenders.map((tender) => (tender.id === saved.id ? saved : tender));
        } else {
          const canvas = buildCanvas('', currentUser?.id ?? null, actor, now).map((doc) => ({
            id: crypto.randomUUID(),
            ...doc,
          }));
          saved = {
            id: crypto.randomUUID(),
            reference: buildReference('AOO'),
            created_by: currentUser?.id ?? null,
            created_by_name: actor,
            created_at: now,
            service_orders: [],
            ...payload,
          } as Tender;
          saved.documents = canvas.map((doc) => ({ ...doc, tender_id: saved.id }));
          updated = [saved, ...tenders];
        }
        setTenders(updated);
        setStoredData(STORAGE_KEYS.TENDERS, updated);
        logAudit({
          action: editing ? 'UPDATE' : 'CREATE',
          entityName: 'tenders',
          entityId: saved.id,
          oldValue: editing ?? null,
          newValue: saved,
        });
      }

      setIsFormOpen(false);
      resetForm();
    } catch (error) {
      console.error('[Marchés publics] Enregistrement impossible :', error);
      setDataError(error instanceof Error ? error.message : 'L’enregistrement du marché a échoué.');
    } finally {
      setIsSaving(false);
    }
  };

  const advanceTender = async (tender: Tender) => {
    const next = NEXT_TENDER_STATUS[tender.status];
    if (!next) return;
    setDataError(null);
    const now = new Date().toISOString();
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tenders').update({ status: next, updated_at: now }).eq('id', tender.id);
        if (error) throw error;
        const fresh = await loadConnectedData();
        if (detailTender?.id === tender.id) setDetailTender(fresh.find((item) => item.id === tender.id) ?? null);
      } else {
        const updated = tenders.map((candidate) =>
          candidate.id === tender.id ? { ...candidate, status: next, updated_at: now } : candidate
        );
        persistDemo(updated, 'tenders', 'UPDATE', tender.id, tender, { ...tender, status: next });
        if (detailTender?.id === tender.id) {
          setDetailTender(updated.find((item) => item.id === tender.id) ?? null);
        }
      }
    } catch (error) {
      console.error('[Marchés publics] Changement de statut impossible :', error);
      setDataError(error instanceof Error ? error.message : 'Le changement de statut a échoué.');
    }
  };

  const advanceDocument = async (tender: Tender, doc: TenderDocument) => {
    const next = DOC_NEXT_STATUS[doc.status];
    if (!next) return;
    setDataError(null);
    const now = new Date().toISOString();
    const actor = currentUser ? displayName(currentUser) : null;

    const refresh = (updated: Tender[]) => {
      if (detailTender?.id === tender.id) setDetailTender(updated.find((item) => item.id === tender.id) ?? null);
    };

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('tender_documents')
          .update({
            status: next,
            obtained_at: next === 'obtenu' || next === 'valide' ? today() : doc.obtained_at,
            updated_at: now,
          })
          .eq('id', doc.id);
        if (error) throw error;
        refresh(await loadConnectedData());
      } else {
        const updated = tenders.map((candidate) =>
          candidate.id === tender.id
            ? {
                ...candidate,
                updated_at: now,
                documents: applyDocAdvance(
                  candidate.documents ?? [],
                  doc.id,
                  next,
                  currentUser?.id ?? null,
                  actor,
                  now
                ),
              }
            : candidate
        );
        persistDemo(updated, 'tender_documents', 'UPDATE', doc.id, doc, { ...doc, status: next });
        refresh(updated);
      }
    } catch (error) {
      console.error('[Marchés publics] Avancement de la pièce impossible :', error);
      setDataError(error instanceof Error ? error.message : "L'avancement de la pièce a échoué.");
    }
  };

  const addDocument = async (tender: Tender) => {
    if (!docTitle.trim()) {
      setDataError('Indiquez l’intitulé de la pièce à ajouter.');
      return;
    }
    setDataError(null);
    const now = new Date().toISOString();
    const actor = currentUser ? displayName(currentUser) : null;
    const record = {
      tender_id: tender.id,
      title: docTitle.trim(),
      category: docCategory,
      status: 'a_obtenir' as TenderDocStatus,
      obtained_at: null,
      valid_until: null,
      notes: null,
      created_by: currentUser?.id ?? null,
      created_by_name: actor,
      created_at: now,
      updated_at: now,
    };

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tender_documents').insert(record);
        if (error) throw error;
        setTenders(await loadConnectedData());
      } else {
        const updated = tenders.map((candidate) =>
          candidate.id === tender.id
            ? { ...candidate, documents: [...(candidate.documents ?? []), { id: crypto.randomUUID(), ...record }] }
            : candidate
        );
        persistDemo(updated, 'tender_documents', 'CREATE', tender.id, null, record);
      }
      setDocTitle('');
    } catch (error) {
      console.error('[Marchés publics] Ajout de pièce impossible :', error);
      setDataError(error instanceof Error ? error.message : "L'ajout de la pièce a échoué.");
    }
  };

  const deleteDocument = async (tender: Tender, doc: TenderDocument) => {
    setDataError(null);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tender_documents').delete().eq('id', doc.id);
        if (error) throw error;
        const fresh = await loadConnectedData();
        setDetailTender(fresh.find((item) => item.id === tender.id) ?? null);
      } else {
        const updated = tenders.map((candidate) =>
          candidate.id === tender.id
            ? { ...candidate, documents: (candidate.documents ?? []).filter((item) => item.id !== doc.id) }
            : candidate
        );
        persistDemo(updated, 'tender_documents', 'DELETE', doc.id, doc, null);
        if (detailTender?.id === tender.id) {
          setDetailTender(updated.find((item) => item.id === tender.id) ?? null);
        }
      }
    } catch (error) {
      console.error('[Marchés publics] Suppression de la pièce impossible :', error);
      setDataError(error instanceof Error ? error.message : 'La suppression de la pièce a échoué.');
    }
  };

  const addServiceOrder = async (tender: Tender) => {
    if (!orderTitle.trim()) {
      setDataError("Indiquez l'intitulé de l'ordre de service ou du décompte.");
      return;
    }
    setDataError(null);
    const now = new Date().toISOString();
    const record = {
      tender_id: tender.id,
      reference: buildReference(ORDER_PREFIX[orderType]),
      order_type: orderType,
      title: orderTitle.trim(),
      issued_on: orderDate || null,
      amount: numericOrNull(orderAmount),
      status: 'emis' as ServiceOrderStatus,
      notes: null,
      created_by: currentUser?.id ?? null,
      created_by_name: currentUser ? displayName(currentUser) : null,
      created_at: now,
      updated_at: now,
    };

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tender_service_orders').insert(record);
        if (error) throw error;
        const fresh = await loadConnectedData();
        setDetailTender(fresh.find((item) => item.id === tender.id) ?? null);
      } else {
        const updated = tenders.map((candidate) =>
          candidate.id === tender.id
            ? {
                ...candidate,
                updated_at: now,
                service_orders: [...(candidate.service_orders ?? []), { id: crypto.randomUUID(), ...record }],
              }
            : candidate
        );
        persistDemo(updated, 'tender_service_orders', 'CREATE', tender.id, null, record);
        setDetailTender(updated.find((item) => item.id === tender.id) ?? null);
      }
      setOrderTitle('');
      setOrderAmount('');
    } catch (error) {
      console.error('[Marchés publics] Enregistrement de l’ordre impossible :', error);
      setDataError(error instanceof Error ? error.message : "L'enregistrement de l'ordre de service a échoué.");
    }
  };

  const advanceServiceOrder = async (tender: Tender, order: TenderServiceOrder) => {
    const next = NEXT_SERVICE_ORDER_STATUS[order.status];
    if (!next) return;
    setDataError(null);
    const now = new Date().toISOString();
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('tender_service_orders')
          .update({ status: next, updated_at: now })
          .eq('id', order.id);
        if (error) throw error;
        const fresh = await loadConnectedData();
        setDetailTender(fresh.find((item) => item.id === tender.id) ?? null);
      } else {
        const updated = tenders.map((candidate) =>
          candidate.id === tender.id
            ? {
                ...candidate,
                updated_at: now,
                service_orders: (candidate.service_orders ?? []).map((item) =>
                  item.id === order.id ? { ...item, status: next, updated_at: now } : item
                ),
              }
            : candidate
        );
        persistDemo(updated, 'tender_service_orders', 'UPDATE', order.id, order, { ...order, status: next });
        setDetailTender(updated.find((item) => item.id === tender.id) ?? null);
      }
    } catch (error) {
      console.error('[Marchés publics] Avancement de l’ordre impossible :', error);
      setDataError(error instanceof Error ? error.message : "L'avancement de l'ordre de service a échoué.");
    }
  };

  const deleteServiceOrder = async (tender: Tender, order: TenderServiceOrder) => {
    setDataError(null);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tender_service_orders').delete().eq('id', order.id);
        if (error) throw error;
        const fresh = await loadConnectedData();
        setDetailTender(fresh.find((item) => item.id === tender.id) ?? null);
      } else {
        const updated = tenders.map((candidate) =>
          candidate.id === tender.id
            ? {
                ...candidate,
                service_orders: (candidate.service_orders ?? []).filter((item) => item.id !== order.id),
              }
            : candidate
        );
        persistDemo(updated, 'tender_service_orders', 'DELETE', order.id, order, null);
        setDetailTender(updated.find((item) => item.id === tender.id) ?? null);
      }
    } catch (error) {
      console.error('[Marchés publics] Suppression de l’ordre impossible :', error);
      setDataError(error instanceof Error ? error.message : 'La suppression de l’ordre de service a échoué.');
    }
  };

  const deleteTender = async (tender: Tender) => {
    setDataError(null);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('tenders').delete().eq('id', tender.id);
        if (error) throw error;
        await loadConnectedData();
      } else {
        persistDemo(
          tenders.filter((candidate) => candidate.id !== tender.id),
          'tenders',
          'DELETE',
          tender.id,
          tender,
          null
        );
      }
      if (detailTender?.id === tender.id) setDetailTender(null);
    } catch (error) {
      console.error('[Marchés publics] Suppression impossible :', error);
      setDataError(error instanceof Error ? error.message : 'La suppression du marché a échoué.');
    }
  };

  const docProgress = (tender: Tender) => {
    const docs = tender.documents ?? [];
    if (docs.length === 0) return 'Aucune pièce';
    const ready = docs.filter((doc) => doc.status === 'obtenu' || doc.status === 'valide').length;
    return `${ready}/${docs.length} pièces obtenues`;
  };

  const ordersTotal = (tender: Tender) =>
    (tender.service_orders ?? []).reduce((sum, order) => sum + Number(order.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-executive-emerald" />
            Marchés Publics &amp; Appels d'Offres
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            {tenders.length} marché(s) · {watchingCount} en veille · {wonCount} adjugé(s) ·{' '}
            {formatAmount(offeredTotal)} d'offres remises · {atRiskCount} échéance(s) à tenir
          </p>
        </div>
        {canManage && (
          <Button onClick={() => openForm()} className="gap-2">
            <Plus className="w-4 h-4" /> Suivre un appel d'offres
          </Button>
        )}
      </div>

      {!canManage && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            La consultation des marchés vous est ouverte&nbsp;; l'ouverture des dossiers et la
            planification des ordres de service sont réservées aux porteurs du droit
            « Gérer les marchés publics ».
          </span>
        </div>
      )}

      {dataError && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{dataError}</span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3">
          <CardTitle>Dossiers suivis</CardTitle>
          <div className="flex flex-1 sm:justify-end flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Rechercher..."
                aria-label="Rechercher un marché"
                className="pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-executive-darkBorder bg-white dark:bg-executive-darkBg"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | TenderStatus)}
              className={selectClass}
              aria-label="Filtrer par statut"
            >
              <option value="all">Tous les statuts</option>
              {STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {TENDER_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={methodFilter}
              onChange={(event) => setMethodFilter(event.target.value as 'all' | TenderMethod)}
              className={selectClass}
              aria-label="Filtrer par mode de passation"
            >
              <option value="all">Tous les modes</option>
              {(Object.keys(TENDER_METHOD_LABELS) as TenderMethod[]).map((value) => (
                <option key={value} value={value}>
                  {TENDER_METHOD_LABELS[value]}
                </option>
              ))}
            </select>
            <button
              onClick={() => setOnlyMine((previous) => !previous)}
              className={`px-3 py-2 text-xs rounded-lg border ${
                onlyMine
                  ? 'bg-executive-emerald/10 border-executive-emerald text-executive-emerald font-semibold'
                  : 'border-slate-300 dark:border-executive-darkBorder text-slate-600 dark:text-slate-300'
              }`}
            >
              Mes marchés
            </button>
            <button
              onClick={() => setOnlyDeadline((previous) => !previous)}
              className={`px-3 py-2 text-xs rounded-lg border ${
                onlyDeadline
                  ? 'bg-executive-emerald/10 border-executive-emerald text-executive-emerald font-semibold'
                  : 'border-slate-300 dark:border-executive-darkBorder text-slate-600 dark:text-slate-300'
              }`}
            >
              Échéances à 15 jours
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-8 text-center text-xs text-slate-500">Chargement depuis Supabase...</p>
          ) : visibleTenders.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">Aucun marché ne correspond à ces filtres.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
              {visibleTenders.map((tender) => (
                <li key={tender.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-slate-400">{tender.reference}</span>
                      <Badge variant={TENDER_BADGE[tender.status]}>{TENDER_STATUS_LABELS[tender.status]}</Badge>
                      <Badge variant="neutral">{TENDER_METHOD_LABELS[tender.tender_method]}</Badge>
                      {tender.contract_number && <Badge variant="success">{tender.contract_number}</Badge>}
                      {isTenderOverdue(tender) && <Badge variant="danger">Date dépassée</Badge>}
                      {!isTenderOverdue(tender) && deadlineWithinDays(tender, 15) && (
                        <Badge variant="warning">
                          <CalendarClock className="w-3 h-3 mr-1" /> Échéance proche
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{tender.title}</p>
                    <p className="text-xs text-slate-500 dark:text-executive-darkMuted flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {tender.assigned_to_name || 'Non affecté'}
                      </span>
                      <span>{tender.contracting_authority || "Maître d'ouvrage non précisé"}</span>
                      <span className="flex items-center gap-1">
                        <FileCheck2 className="w-3 h-3" /> {docProgress(tender)}
                      </span>
                      <span>Limite {formatDate(tender.deadline)}</span>
                      <span>Offre {formatAmount(tender.bid_amount)}</span>
                      {(tender.service_orders?.length ?? 0) > 0 && (
                        <span>
                          {tender.service_orders?.length} ordre(s) · {formatAmount(ordersTotal(tender))}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetailTender(tender)} className="gap-1.5">
                      <FileCheck2 className="w-4 h-4" /> Dossier
                    </Button>
                    {canManage && NEXT_TENDER_STATUS[tender.status] && (
                      <Button variant="ghost" size="sm" onClick={() => advanceTender(tender)} className="gap-1.5">
                        <Award className="w-4 h-4" />
                        {TENDER_STATUS_LABELS[NEXT_TENDER_STATUS[tender.status] as TenderStatus]}
                      </Button>
                    )}
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => openForm(tender)}>
                        Modifier
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTender(tender)}
                        aria-label={`Supprimer ${tender.reference}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? 'Modifier le marché' : "Suivre un appel d'offres"}
        description={
          editing
            ? editing.reference
            : 'Le dossier de pièces administratives, techniques et financières sera généré'
        }
        maxWidth="xl"
        footer={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form="tender-form" disabled={isSaving}>
              {isSaving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer et générer le dossier'}
            </Button>
          </div>
        }
      >
        <form id="tender-form" onSubmit={handleSave} className="space-y-4">
          <Input
            label="Intitulé du marché"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Construction du bloc scolaire de Nkolbesson"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Maître d'ouvrage"
              value={authority}
              onChange={(event) => setAuthority(event.target.value)}
              placeholder="MINESUP — Délégation Régionale du Littoral"
            />
            <Input
              label="Source de l'avis"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="COLEPS, journal, plateforme MINMAP"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={fieldLabel}>Mode de passation</label>
              <select value={method} onChange={(event) => setMethod(event.target.value as TenderMethod)} className={selectClass}>
                {(Object.keys(TENDER_METHOD_LABELS) as TenderMethod[]).map((value) => (
                  <option key={value} value={value}>
                    {TENDER_METHOD_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Statut</label>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as TenderStatus)}
                className={selectClass}
              >
                {STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {TENDER_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Chargé de marché</label>
              <select value={assignee} onChange={(event) => setAssignee(event.target.value)} className={selectClass}>
                <option value="">Non affecté</option>
                {collaborators.map((user) => (
                  <option key={user.id} value={user.id}>
                    {displayName(user)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Montant prévisionnel (FCFA)"
              type="number"
              min="0"
              value={estimatedAmount}
              onChange={(event) => setEstimatedAmount(event.target.value)}
            />
            <Input
              label="Caution de soumission (FCFA)"
              type="number"
              min="0"
              value={cautionAmount}
              onChange={(event) => setCautionAmount(event.target.value)}
            />
            <Input
              label="Montant de l'offre (FCFA)"
              type="number"
              min="0"
              value={bidAmount}
              onChange={(event) => setBidAmount(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Publication de l'avis"
              type="date"
              value={publicationDate}
              onChange={(event) => setPublicationDate(event.target.value)}
            />
            <Input label="Date limite" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            <Input
              label="Délai d'exécution (jours)"
              type="number"
              min="1"
              value={executionDelay}
              onChange={(event) => setExecutionDelay(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Localisation"
              value={siteLocation}
              onChange={(event) => setSiteLocation(event.target.value)}
              placeholder="Nkolbesson, Région du Centre"
            />
            <Input
              label="Numéro de contrat"
              value={contractNumber}
              onChange={(event) => setContractNumber(event.target.value)}
              placeholder="N° 0127/AAN/2026"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Date d'adjudication"
              type="date"
              value={awardedAt}
              onChange={(event) => setAwardedAt(event.target.value)}
            />
            <Input
              label="Signature du contrat"
              type="date"
              value={contractSignedAt}
              onChange={(event) => setContractSignedAt(event.target.value)}
            />
            <Input
              label="Avance de départ (%)"
              type="number"
              min="0"
              max="100"
              value={advanceRate}
              onChange={(event) => setAdvanceRate(event.target.value)}
            />
          </div>
          <div>
            <label className={fieldLabel}>Notes de suivi</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={selectClass}
              placeholder="Visite de site, pièces manquantes, réunion préparatoire..."
            />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(detailTender)}
        onClose={() => setDetailTender(null)}
        title={detailTender ? detailTender.title : ''}
        description={detailTender ? `${detailTender.reference} · ${docProgress(detailTender)}` : undefined}
        maxWidth="xl"
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <span className="text-xs text-slate-500 dark:text-executive-darkMuted">
              {detailTender ? `Ordres et décomptes : ${formatAmount(ordersTotal(detailTender))}` : ''}
            </span>
            <Button variant="ghost" onClick={() => setDetailTender(null)}>
              Fermer
            </Button>
          </div>
        }
      >
        {detailTender && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-executive-darkSurface">
                <p className="text-slate-500 dark:text-executive-darkMuted">Maître d'ouvrage</p>
                <p className="font-semibold">{detailTender.contracting_authority || '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-executive-darkSurface">
                <p className="text-slate-500 dark:text-executive-darkMuted">Date limite</p>
                <p className="font-semibold">{formatDate(detailTender.deadline)}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-executive-darkSurface">
                <p className="text-slate-500 dark:text-executive-darkMuted">Offre remise</p>
                <p className="font-semibold">{formatAmount(detailTender.bid_amount)}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-executive-darkSurface">
                <p className="text-slate-500 dark:text-executive-darkMuted">Avance / contrat</p>
                <p className="font-semibold">
                  {detailTender.advance_payment_rate ? `${detailTender.advance_payment_rate} %` : '—'}
                  {detailTender.contract_number ? ` · ${detailTender.contract_number}` : ''}
                </p>
              </div>
            </div>

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted">
                Pièces du dossier
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                {(detailTender.documents ?? []).map((doc) => (
                  <li key={doc.id} className="py-2.5 flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{doc.title}</p>
                      <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
                        {TENDER_DOC_CATEGORY_LABELS[doc.category]} ·{' '}
                        {doc.obtained_at ? `obtenue le ${formatDate(doc.obtained_at)}` : 'non obtenue'}
                        {doc.valid_until ? ` · valable jusqu'au ${formatDate(doc.valid_until)}` : ''}
                      </p>
                    </div>
                    <Badge variant={DOC_BADGE[doc.status]}>{TENDER_DOC_STATUS_LABELS[doc.status]}</Badge>
                    {canManage && DOC_NEXT_STATUS[doc.status] && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => advanceDocument(detailTender, doc)}
                        aria-label={`Faire avancer la pièce ${doc.title}`}
                      >
                        {TENDER_DOC_STATUS_LABELS[DOC_NEXT_STATUS[doc.status] as TenderDocStatus]}
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteDocument(detailTender, doc)}
                        aria-label={`Supprimer la pièce ${doc.title}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </li>
                ))}
                {(detailTender.documents ?? []).length === 0 && (
                  <li className="py-3 text-xs text-slate-500">
                    Aucune pièce&nbsp;: le canevas du dossier n'a pas été généré pour ce marché.
                  </li>
                )}
              </ul>

              {canManage && (
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-2 items-end">
                  <Input
                    label="Ajouter une pièce"
                    value={docTitle}
                    onChange={(event) => setDocTitle(event.target.value)}
                    placeholder="Attestation de non-imposition de moins de trois mois"
                  />
                  <div>
                    <label className={fieldLabel}>Catégorie</label>
                    <select
                      value={docCategory}
                      onChange={(event) => setDocCategory(event.target.value as TenderDocCategory)}
                      className={selectClass}
                      aria-label="Catégorie de la pièce"
                    >
                      {(Object.keys(TENDER_DOC_CATEGORY_LABELS) as TenderDocCategory[]).map((value) => (
                        <option key={value} value={value}>
                          {TENDER_DOC_CATEGORY_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button onClick={() => addDocument(detailTender)} className="gap-1.5">
                    <FilePlus2 className="w-4 h-4" /> Ajouter
                  </Button>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted">
                Ordres de service, avenants et décomptes
              </h2>
              <ul className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                {(detailTender.service_orders ?? []).map((order) => (
                  <li key={order.id} className="py-2.5 flex items-center gap-3">
                    <span className="text-[11px] font-mono text-slate-400 w-32">{order.reference}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{order.title}</p>
                      <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
                        {SERVICE_ORDER_TYPE_LABELS[order.order_type]} · {formatDate(order.issued_on)} ·{' '}
                        {formatAmount(order.amount)}
                      </p>
                    </div>
                    <Badge variant={ORDER_BADGE[order.status]}>{SERVICE_ORDER_STATUS_LABELS[order.status]}</Badge>
                    {canManage && NEXT_SERVICE_ORDER_STATUS[order.status] && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => advanceServiceOrder(detailTender, order)}
                        aria-label={`Faire avancer ${order.reference}`}
                      >
                        {SERVICE_ORDER_STATUS_LABELS[NEXT_SERVICE_ORDER_STATUS[order.status] as ServiceOrderStatus]}
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteServiceOrder(detailTender, order)}
                        aria-label={`Supprimer ${order.reference}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </li>
                ))}
                {(detailTender.service_orders ?? []).length === 0 && (
                  <li className="py-3 text-xs text-slate-500">Aucun ordre de service enregistré pour ce marché.</li>
                )}
              </ul>

              {canManage && (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className={fieldLabel}>Nature</label>
                    <select
                      value={orderType}
                      onChange={(event) => setOrderType(event.target.value as ServiceOrderType)}
                      className={selectClass}
                      aria-label="Nature de l'ordre"
                    >
                      {(Object.keys(SERVICE_ORDER_TYPE_LABELS) as ServiceOrderType[]).map((value) => (
                        <option key={value} value={value}>
                          {SERVICE_ORDER_TYPE_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Intitulé"
                    value={orderTitle}
                    onChange={(event) => setOrderTitle(event.target.value)}
                    placeholder="OS n° 03 — démarrage des travaux"
                  />
                  <Input label="Date" type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} />
                  <Input
                    label="Montant (FCFA)"
                    type="number"
                    min="0"
                    value={orderAmount}
                    onChange={(event) => setOrderAmount(event.target.value)}
                  />
                  <Button onClick={() => addServiceOrder(detailTender)} className="gap-1.5 self-end">
                    <Plus className="w-4 h-4" /> Enregistrer
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
};
