import { AppSettings, AuditLogEntry, Permission, UserProfile, UserRole } from '../types/auth.types';
import { Client, Partner, LandProperty, Subdivision, Block, Plot, PlotStatusHistory, PlotStatus } from '../types/land.types';
import { Reservation, Sale, PaymentSchedule, Receipt, ThirdPartySettlement } from '../types/sales.types';
import { ServiceType, ServiceCase, FinancingCase } from '../types/services.types';
import { FinancialAccount, FinancialCategory, ExpenseRequest, FinancialTransaction, FinancialTransfer, CashClosure } from '../types/finance.types';
import { isSupabaseConfigured } from './supabase';

export const STORAGE_KEYS = {
  SETTINGS: 'bell_mms_app_settings',
  USERS: 'bell_mms_users',
  ROLES: 'bell_mms_roles',
  PERMISSIONS: 'bell_mms_permissions',
  AUDIT_LOGS: 'bell_mms_audit_logs',
  CURRENT_USER: 'bell_mms_current_user',
  CLIENTS: 'bell_mms_clients',
  PARTNERS: 'bell_mms_partners',
  LAND_PROPERTIES: 'bell_mms_land_properties',
  SUBDIVISIONS: 'bell_mms_subdivisions',
  BLOCKS: 'bell_mms_blocks',
  PLOTS: 'bell_mms_plots',
  PLOT_STATUS_HISTORY: 'bell_mms_plot_status_history',
  RESERVATIONS: 'bell_mms_reservations',
  SALES: 'bell_mms_sales',
  PAYMENT_SCHEDULES: 'bell_mms_payment_schedules',
  RECEIPTS: 'bell_mms_receipts',
  THIRD_PARTY_SETTLEMENTS: 'bell_mms_third_party_settlements',
  SERVICE_TYPES: 'bell_mms_service_types',
  SERVICE_CASES: 'bell_mms_service_cases',
  FINANCING_CASES: 'bell_mms_financing_cases',
  FINANCIAL_ACCOUNTS: 'bell_mms_financial_accounts',
  FINANCIAL_CATEGORIES: 'bell_mms_financial_categories',
  EXPENSE_REQUESTS: 'bell_mms_expense_requests',
  FINANCIAL_TRANSACTIONS: 'bell_mms_financial_transactions',
  FINANCIAL_TRANSFERS: 'bell_mms_financial_transfers',
  CASH_CLOSURES: 'bell_mms_cash_closures',
};

export const DEFAULT_ROLES: UserRole[] = [
  { id: 'role-super-admin', code: 'super_admin', name: 'Super Administrateur', description: 'Accès technique total, maintenance et configuration système', is_system: true },
  { id: 'role-dg', code: 'directeur_general', name: 'Directeur Général', description: 'Supervision globale, validations stratégiques et financières', is_system: true },
  { id: 'role-secretaire', code: 'secretaire', name: 'Secrétaire', description: 'Gestion administrative, accueil clients, courriers et dossiers', is_system: true },
  { id: 'role-collaborateur', code: 'collaborateur', name: 'Collaborateur', description: 'Exécution opérationnelle des dossiers et des tâches assignées', is_system: true },
];

export const DEFAULT_PERMISSIONS: Permission[] = [
  { id: 'p1', code: 'admin:settings:read', module: 'admin', name: 'Consulter les paramètres système', description: 'Accès aux paramètres généraux' },
  { id: 'p2', code: 'admin:settings:write', module: 'admin', name: 'Modifier les paramètres système', description: 'Modification de la configuration' },
  { id: 'p3', code: 'admin:users:manage', module: 'admin', name: 'Gérer les utilisateurs', description: 'Création et gestion des comptes' },
  { id: 'p4', code: 'admin:roles:manage', module: 'admin', name: 'Gérer les rôles et permissions', description: 'Attribution des privilèges' },
  { id: 'p5', code: 'admin:audit:read', module: 'admin', name: 'Consulter le journal d\'audit', description: 'Accès aux logs de traçabilité' },
  { id: 'p6', code: 'dashboard:dg:view', module: 'dashboard', name: 'Tableau de bord Directeur Général', description: 'Vision globale stratégique et financière' },
  { id: 'p7', code: 'dashboard:secretaire:view', module: 'dashboard', name: 'Tableau de bord Secrétariat', description: 'Vision administrative et courriers' },
  { id: 'p8', code: 'dashboard:collaborateur:view', module: 'dashboard', name: 'Tableau de bord Collaborateur', description: 'Suivi des tâches et dossiers affectés' },
  { id: 'p9', code: 'land:read', module: 'land', name: 'Consulter le patrimoine foncier', description: 'Visualiser les terrains et parcelles' },
  { id: 'p10', code: 'land:write', module: 'land', name: 'Gérer le patrimoine foncier', description: 'Ajouter ou modifier des terrains' },
  { id: 'p11', code: 'land:status:change', module: 'land', name: 'Changer le statut d\'une parcelle', description: 'Bloquer, débloquer ou marquer en litige' },
  { id: 'p12', code: 'sales:read', module: 'sales', name: 'Consulter les ventes', description: 'Voir les ventes et échéanciers' },
  { id: 'p13', code: 'sales:create', module: 'sales', name: 'Créer une vente ou réservation', description: 'Initier une vente comptant ou échelonnée' },
  { id: 'p14', code: 'sales:validate', module: 'sales', name: 'Valider définitivement une vente', description: 'Validation finale' },
  { id: 'p15', code: 'clients:read', module: 'clients', name: 'Consulter les clients', description: 'Carnet d\'adresses' },
  { id: 'p16', code: 'clients:write', module: 'clients', name: 'Gérer les clients', description: 'Création et mise à jour' },
  { id: 'p17', code: 'services:read', module: 'services', name: 'Consulter les dossiers', description: 'Mutations et jugements' },
  { id: 'p18', code: 'services:write', module: 'services', name: 'Traiter les dossiers', description: 'Mettre à jour les étapes' },
  { id: 'p19', code: 'services:validate', module: 'services', name: 'Valider un dossier', description: 'Approbation finale direction' },
  { id: 'p20', code: 'finance:read', module: 'finance', name: 'Consulter la trésorerie', description: 'Soldes des caisses et comptes' },
  { id: 'p21', code: 'finance:expense:request', module: 'finance', name: 'Demander une dépense', description: 'Soumettre une demande' },
  { id: 'p22', code: 'finance:expense:approve', module: 'finance', name: 'Approuver les dépenses', description: 'Validation selon seuils' },
  { id: 'p23', code: 'finance:cash:manage', module: 'finance', name: 'Gérer les caisses', description: 'Mouvements et clôtures' },
  { id: 'p24', code: 'finance:reports:export', module: 'finance', name: 'Exporter rapports financiers', description: 'États consolidés' },
  { id: 'p25', code: 'projects:manage', module: 'projects', name: 'Gérer les chantiers', description: 'Suivi travaux' },
  { id: 'p26', code: 'tenders:manage', module: 'tenders', name: 'Gérer les marchés publics', description: 'Appels d\'offres et contrats' },
];

export const ROLE_PERMISSIONS_MAP: Record<string, string[]> = {
  super_admin: DEFAULT_PERMISSIONS.map(p => p.code),
  directeur_general: DEFAULT_PERMISSIONS.filter(p => !['admin:users:manage', 'admin:roles:manage', 'admin:settings:write'].includes(p.code)).map(p => p.code),
  secretaire: [
    'dashboard:secretaire:view',
    'clients:read', 'clients:write',
    'land:read',
    'sales:read', 'sales:create',
    'services:read', 'services:write',
    'finance:expense:request'
  ],
  collaborateur: [
    'dashboard:collaborateur:view',
    'clients:read',
    'land:read',
    'services:read', 'services:write',
    'finance:expense:request',
    'projects:manage'
  ]
};

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'current',
  company_name: 'BELL MULTI-MANAGEMENT SYSTEM',
  legal_form: 'SARL',
  rccm: 'RC/DLA/2026/B/1234',
  niu: 'M112612345678X',
  address: 'Akwa, Douala — Cameroun',
  phone: '+237 699 00 11 22',
  email: 'direction@bell-mms.cm',
  currency: 'XAF',
  currency_symbol: 'FCFA',
  default_reservation_duration_days: 14,
  expense_approval_threshold_dg: 250000,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const INITIAL_USERS: UserProfile[] = [
  { id: 'user-admin-01', first_name: 'Administrateur', last_name: 'Système', email: 'admin@bell-mms.cm', phone: '+237 677 00 00 01', role_id: 'role-super-admin', job_title: 'Super Administrateur IT', is_active: true, theme_preference: 'light', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'user-dg-01', first_name: 'Paul', last_name: 'BELL', email: 'dg@bell-mms.cm', phone: '+237 699 00 00 02', role_id: 'role-dg', job_title: 'Directeur Général', is_active: true, theme_preference: 'light', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'user-sec-01', first_name: 'Chantal', last_name: 'NGO', email: 'secretaire@bell-mms.cm', phone: '+237 670 00 00 03', role_id: 'role-secretaire', job_title: 'Secrétaire de Direction', is_active: true, theme_preference: 'light', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'user-collab-01', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'collaborateur@bell-mms.cm', phone: '+237 655 00 00 04', role_id: 'role-collaborateur', job_title: 'Chargé d\'Opérations Foncières', is_active: true, theme_preference: 'light', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_PARTNERS: Partner[] = [
  { id: 'par-01', code: 'PAR-2026-001', partner_type: 'proprietaire_foncier', name: 'Famille EYANGO & Ayants-Droit', contact_person: 'M. Jacques Eyango', phone: '+237 699 44 22 11', email: 'famille.eyango@gmail.com', address: 'PK21, Douala 5ème', city: 'Douala', commission_rate: 0, notes: 'Propriétaire du titre foncier global TF 18450/Wouri sous mandat de commercialisation avec BELL ENTERPRISE.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'par-02', code: 'PAR-2026-002', partner_type: 'geometre', name: 'Cabinet Topographique & Cadastral du Littoral (CTC)', contact_person: 'Ing. René MBIA', phone: '+237 677 33 55 77', email: 'contact@ctc-geometre.cm', address: 'Bonanjo, Immeuble Horizon', city: 'Douala', commission_rate: 0, notes: 'Géomètre assermenté pour le piquetage et les dossiers de morcellement.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'par-03', code: 'PAR-2026-003', partner_type: 'apporteur_affaires', name: 'Alain KOUAM', contact_person: 'Alain Kouam', phone: '+237 690 12 34 56', email: 'kouam.affaires@yahoo.fr', address: 'Akwa', city: 'Douala', commission_rate: 5.0, notes: 'Apporteur d\'affaires régulier sur les parcelles de Japoma et PK21.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_CLIENTS: Client[] = [
  { id: 'cli-01', code: 'CLI-2026-001', client_type: 'particulier', first_name: 'Marc', last_name: 'KAMDEM', cni_number: '118239045', phone: '+237 675 11 22 33', email: 'marc.kamdem@gmail.com', address: 'Bonamoussadi', city: 'Douala', country: 'Cameroun', notes: 'Intéressé par 2 lots pour construction de villa résidentielle.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'cli-02', code: 'CLI-2026-002', client_type: 'entreprise', company_name: 'SOCIÉTÉ CIVILE IMMOBILIÈRE LOBÉ RESIDENCE', first_name: 'Suzanne', last_name: 'EPOUPA', phone: '+237 694 55 66 77', email: 'direction@scilobe.cm', address: 'Boulevard de la Liberté, Akwa', city: 'Douala', country: 'Cameroun', notes: 'Achat de 4 parcelles contiguës à Yassa.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_LAND_PROPERTIES: LandProperty[] = [
  { id: 'land-01', reference: 'TER-2026-001', designation: 'Domaine Résidentiel de Japoma - Akwa-Nord Extension', ownership_type: 'entreprise', land_title_number: 'TF 22104/Wouri', cadastral_reference: 'Section 4 - Parcelle 12', region: 'Littoral', division: 'Wouri', subdivision_name: 'Douala 3ème', locality: 'Japoma (Proximité Stade)', total_area_sqm: 45000, purchase_price: 180000000, status: 'commercialise', latitude: 4.0152, longitude: 9.8241, notes: 'Titre foncier définitif pur et libre de toute charge hypothécaire.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'land-02', reference: 'TER-2026-002', designation: 'Lotissement des Palmiers PK21 - Route Nationale 3', ownership_type: 'tiers_mandat', owner_partner_id: 'par-01', land_title_number: 'TF 18450/Wouri', cadastral_reference: 'Section 12 - Bloc C', region: 'Littoral', division: 'Wouri', subdivision_name: 'Douala 5ème', locality: 'PK21 (Axe Lourd Douala-Yaoundé)', total_area_sqm: 60000, purchase_price: 0, status: 'en_lotissement', latitude: 4.0925, longitude: 9.8510, mandate_details: { duration_months: 24, commission_percentage: 12.0, reference_price_sqm: 15000, start_date: '2026-01-15' }, notes: 'Mandat exclusif signé avec la Famille Eyango. Marge commerciale et commissions contractuelles.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_SUBDIVISIONS: Subdivision[] = [
  { id: 'sub-01', land_property_id: 'land-01', reference: 'LOT-JAPOMA-2026', name: 'Lotissement La Grâce de Japoma', total_area_sqm: 45000, total_plots_count: 50, status: 'en_cours', authorization_number: 'Arrêté N° 00482/MINDCAF/D3/2026', authorization_date: '2026-02-10', notes: 'Lotissement approuvé avec voies d\'accès de 10m et 12m réservées.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_BLOCKS: Block[] = [
  { id: 'blk-01', subdivision_id: 'sub-01', name: 'Bloc A — Façade Voie Principale', description: 'Lots commerciaux et résidentiels de prestige', created_at: new Date().toISOString() },
  { id: 'blk-02', subdivision_id: 'sub-01', name: 'Bloc B — Cœur Résidentiel', description: 'Lots calmes pour villas privées', created_at: new Date().toISOString() },
];

export const INITIAL_PLOTS: Plot[] = [
  { id: 'plot-01', subdivision_id: 'sub-01', block_id: 'blk-01', plot_number: 'Lot A-01', area_sqm: 500, facade_m: 20, depth_m: 25, price_per_sqm: 35000, total_price: 17500000, status: 'disponible', latitude: 4.0156, longitude: 9.8239, notes: 'Parcelle d\'angle stratégique, accès immédiat voie bitumée.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'plot-02', subdivision_id: 'sub-01', block_id: 'blk-01', plot_number: 'Lot A-02', area_sqm: 500, facade_m: 20, depth_m: 25, price_per_sqm: 35000, total_price: 17500000, status: 'reservee', latitude: 4.0158, longitude: 9.8242, notes: 'Réservation en cours pour M. Kamdem (Fiche RES-2026-004).', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'plot-03', subdivision_id: 'sub-01', block_id: 'blk-02', plot_number: 'Lot B-05', area_sqm: 600, facade_m: 24, depth_m: 25, price_per_sqm: 30000, total_price: 18000000, status: 'vendue', latitude: 4.0148, longitude: 9.8245, notes: 'Vente définitive enregistrée avec paiement intégral.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'plot-04', subdivision_id: 'sub-01', block_id: 'blk-02', plot_number: 'Lot B-06', area_sqm: 450, facade_m: 18, depth_m: 25, price_per_sqm: 30000, total_price: 13500000, status: 'disponible', latitude: 4.0145, longitude: 9.8248, notes: 'Terrain plat, prêt pour fondations immédiates.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'plot-05', subdivision_id: 'sub-01', block_id: 'blk-02', plot_number: 'Lot B-07', area_sqm: 450, facade_m: 18, depth_m: 25, price_per_sqm: 30000, total_price: 13500000, status: 'bloquee', latitude: 4.0143, longitude: 9.8251, notes: 'Blocage administratif conservatoire temporaire.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_RESERVATIONS: Reservation[] = [
  { id: 'res-01', reference: 'RES-2026-004', client_id: 'cli-01', plot_id: 'plot-02', agreed_price: 17500000, deposit_amount: 2500000, reservation_date: '2026-11-01', duration_days: 14, expiration_date: '2026-11-15', status: 'active', sales_rep_name: 'Emmanuel FOTSO', conditions: 'Règlement du solde prévu par virement bancaire sous 14 jours.', notes: 'Client sérieux, compromis en cours de préparation.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_SALES: Sale[] = [
  { id: 'sale-01', reference: 'VTE-2026-001', client_id: 'cli-02', plot_id: 'plot-03', sale_type: 'comptant', sale_date: '2026-10-25', total_price: 18000000, discount_amount: 0, final_price: 18000000, initial_deposit: 18000000, remaining_balance: 0, payment_method: 'virement', status: 'soldee', sales_rep_name: 'Emmanuel FOTSO', validated_by_name: 'Paul BELL (DG)', validated_at: '2026-10-26T10:00:00Z', notes: 'Paiement intégral reçu sur compte UBA Cameroun.', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_RECEIPTS: Receipt[] = [
  { id: 'rec-01', reference: 'REC-2026-001', sale_id: 'sale-01', amount: 18000000, payment_date: '2026-10-25', payment_method: 'virement', transaction_ref: 'VIR-UBA-994821', received_by_name: 'Paul BELL', notes: 'Règlement intégral comptant.', created_at: new Date().toISOString() },
];

export const INITIAL_SETTLEMENTS: ThirdPartySettlement[] = [
  { id: 'rev-01', reference: 'REV-2026-001', partner_id: 'par-01', partner_name: 'Famille EYANGO & Ayants-Droit', sale_id: 'sale-01', sale_reference: 'VTE-2026-001', plot_number: 'Lot B-05', total_sale_price: 18000000, owner_base_amount: 15840000, company_commission: 2160000, amount_paid_to_owner: 10000000, balance_due_to_owner: 5840000, status: 'partiellement_paye', settlement_date: '2026-10-28', payment_proof_ref: 'CHQ-BICEC-004812', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_SERVICE_TYPES: ServiceType[] = [
  { id: 'st-01', code: 'mutation_totale', name: 'Mutation Foncière Totale', description: 'Transfert intégral de propriété d\'un titre foncier existant auprès de la Conservation Foncière', standard_fee: 750000, estimated_duration_days: 60, required_documents: ['Titre Foncier original', 'Acte de vente notarié', 'CNI des parties', 'Quittance droits d\'enregistrement'], is_active: true },
  { id: 'st-02', code: 'mutation_partielle', name: 'Mutation Foncière Partielle (Morcellement)', description: 'Création d\'un nouveau titre foncier issu d\'un lotissement ou morcellement', standard_fee: 950000, estimated_duration_days: 90, required_documents: ['Plan de bornage visé par le Cadastre', 'Certificat de propriété récent', 'PV de bornage contradictoire', 'Acte de vente notarié'], is_active: true },
  { id: 'st-03', code: 'jugement_heredite', name: 'Jugement d\'Hérédité & Déclaration de Succession', description: 'Régularisation successorale auprès du Tribunal de Première Instance', standard_fee: 500000, estimated_duration_days: 45, required_documents: ['Acte de décès du de cujus', 'Actes de naissance des ayants-droit', 'Certificat de mariage', 'Certificat de non-appel'], is_active: true },
  { id: 'st-04', code: 'dossier_cadastre', name: 'Dossier Technique & Levé Cadastral', description: 'Bornage contradictoire et immatriculation au Cadastre', standard_fee: 400000, estimated_duration_days: 30, required_documents: ['Croquis géomètre', 'Accords des riverains', 'PV de bornage'], is_active: true },
];

export const INITIAL_SERVICE_CASES: ServiceCase[] = [
  {
    id: 'case-01',
    reference: 'MUT-2026-008',
    client_id: 'cli-01',
    service_type_id: 'st-01',
    title: 'Mutation Foncière Titre Foncier TF 19402/Wouri - M. Kamdem',
    description: 'Procédure de mutation suite à acquisition du terrain de Bonamoussadi.',
    assigned_to_id: 'user-collab-01',
    assigned_to_name: 'Emmanuel FOTSO',
    opened_date: '2026-10-15',
    target_date: '2026-12-15',
    status: 'soumis_validation_dg',
    fee_agreed: 750000,
    expenses_estimated: 350000,
    expenses_actual: 320000,
    amount_paid: 500000,
    dg_validation_status: 'en_attente',
    steps: [
      { id: 'step-1', case_id: 'case-01', step_order: 1, title: 'Collecte et vérification des pièces', status: 'termine', completed_by_name: 'Chantal NGO', completed_at: '2026-10-18T10:00:00Z' },
      { id: 'step-2', case_id: 'case-01', step_order: 2, title: 'Rédaction acte chez le Notaire', status: 'termine', completed_by_name: 'Emmanuel FOTSO', completed_at: '2026-10-28T14:30:00Z' },
      { id: 'step-3', case_id: 'case-01', step_order: 3, title: 'Dépôt à la Conservation Foncière du Wouri', status: 'termine', completed_by_name: 'Emmanuel FOTSO', completed_at: '2026-11-04T09:00:00Z' },
      { id: 'step-4', case_id: 'case-01', step_order: 4, title: 'Validation formelle Direction Générale', status: 'en_cours' },
      { id: 'step-5', case_id: 'case-01', step_order: 5, title: 'Délivrance du duplicatum Titre Foncier au client', status: 'en_attente' },
    ],
    notes: 'Dossier complet, attente de l\'approbation formelle de M. le Directeur Général pour clôture des honoraires.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const INITIAL_FINANCING_CASES: FinancingCase[] = [
  {
    id: 'fin-01',
    reference: 'FIN-2026-003',
    client_id: 'cli-02',
    partner_bank_name: 'UBA Cameroun (Banque Partenaire)',
    purpose: 'Crédit Moyen Terme Acquisition & Viabilisation Lotissement',
    amount_requested: 50000000,
    amount_approved: 50000000,
    duration_months: 60,
    proposed_collateral: 'Hypothèque de premier rang sur Titre Foncier TF 22104/Wouri',
    status: 'financement_obtenu',
    assigned_to_name: 'Paul BELL (DG)',
    commission_rate: 3.0,
    commission_amount: 1500000,
    decision_date: '2026-10-30',
    decision_notes: 'Comité de crédit UBA favorable, notification d\'accord signée.',
    notes: 'Fonds débloqués pour le démarrage des travaux de voirie.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// DONNÉES FINANCES ET TRÉSORERIE RÉELLES (PHASE 5)
export const INITIAL_FINANCIAL_ACCOUNTS: FinancialAccount[] = [
  { id: 'acc-01', code: 'CAISSE-PRINCIPALE', name: 'Caisse Centrale Akwa', account_type: 'caisse', currency: 'XAF', initial_balance: 5000000, current_balance: 4800000, is_active: true, notes: 'Caisse physique siège social Douala', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'acc-02', code: 'CAISSE-PK21', name: 'Caisse Secondaire Chantier PK21', account_type: 'caisse', currency: 'XAF', initial_balance: 1000000, current_balance: 650000, is_active: true, notes: 'Menues dépenses et carburant engins', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'acc-03', code: 'BNK-UBA-DLA', name: 'Compte Courant UBA Cameroun', account_type: 'banque', bank_name: 'UBA Cameroun', account_number: '10033-05200-12345678901-44', currency: 'XAF', initial_balance: 25000000, current_balance: 24500000, is_active: true, notes: 'Compte principal d\'encaissement des ventes', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'acc-04', code: 'BNK-BICEC-DLA', name: 'Compte Opérations BICEC Bonanjo', account_type: 'banque', bank_name: 'BICEC', account_number: '10001-06800-98765432109-12', currency: 'XAF', initial_balance: 15000000, current_balance: 12850000, is_active: true, notes: 'Compte de déblocage des crédits et garanties', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

export const INITIAL_EXPENSES: ExpenseRequest[] = [
  {
    id: 'exp-01',
    reference: 'DEP-2026-012',
    category_code: 'dep_travaux_viabilisation',
    category_name: 'Travaux de viabilisation & Chantiers',
    account_id: 'acc-01',
    account_name: 'Caisse Centrale Akwa',
    beneficiary: 'Entreprise de Terrassement du Littoral (ETL)',
    amount: 1200000, // > 250k FCFA -> Exige validation DG !
    expense_date: '2026-11-04',
    description: 'Nivellement et ouverture des voies secondaires lotissement PK21',
    requested_by_id: 'user-collab-01',
    requested_by_name: 'Emmanuel FOTSO',
    requires_dg_approval: true,
    status: 'en_attente',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'exp-02',
    reference: 'DEP-2026-011',
    category_code: 'dep_frais_generaux',
    category_name: 'Frais généraux & Fonctionnement',
    account_id: 'acc-01',
    account_name: 'Caisse Centrale Akwa',
    beneficiary: 'Papeterie Centrale Akwa',
    amount: 85000, // < 250k FCFA -> Dépense courante décaissée
    expense_date: '2026-11-02',
    description: 'Achat de fournitures de bureau, papier listing et classeurs d\'archives',
    requested_by_id: 'user-sec-01',
    requested_by_name: 'Chantal NGO',
    requires_dg_approval: false,
    status: 'decaisse',
    approved_by_id: 'user-dg-01',
    approved_by_name: 'Paul BELL (DG)',
    approved_at: '2026-11-02T11:00:00Z',
    disbursed_at: '2026-11-02T11:30:00Z',
    payment_proof_ref: 'FAC-PAP-2026-881',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const INITIAL_TRANSACTIONS: FinancialTransaction[] = [
  { id: 'trx-01', reference: 'TRX-2026-001', account_id: 'acc-03', account_name: 'Compte Courant UBA Cameroun', transaction_type: 'recette', category_code: 'rec_vente_terrain', amount: 18000000, transaction_date: '2026-10-25', beneficiary_or_payer: 'SCI LOBE RESIDENCE', description: 'Encaissement total vente comptant Lot B-05 Japoma (VTE-2026-001)', related_entity_type: 'sale', related_entity_id: 'sale-01', balance_after: 42500000, created_by_name: 'Paul BELL', created_at: new Date().toISOString() },
  { id: 'trx-02', reference: 'TRX-2026-002', account_id: 'acc-01', account_name: 'Caisse Centrale Akwa', transaction_type: 'depense', category_code: 'dep_frais_generaux', amount: 85000, transaction_date: '2026-11-02', beneficiary_or_payer: 'Papeterie Centrale Akwa', description: 'Fournitures de bureau (DEP-2026-011)', related_entity_type: 'expense', related_entity_id: 'exp-02', balance_after: 4800000, created_by_name: 'Chantal NGO', created_at: new Date().toISOString() },
];

export const INITIAL_TRANSFERS: FinancialTransfer[] = [
  { id: 'trf-01', reference: 'TRF-2026-001', from_account_id: 'acc-03', from_account_name: 'Compte Courant UBA Cameroun', to_account_id: 'acc-01', to_account_name: 'Caisse Centrale Akwa', amount: 2000000, transfer_date: '2026-10-28', reason: 'Alimentation du fonds de caisse pour frais de démarches administratives', initiated_by_name: 'Paul BELL (DG)', created_at: new Date().toISOString() },
];

export const INITIAL_CASH_CLOSURES: CashClosure[] = [
  { id: 'clo-01', reference: 'CLO-2026-11-07', account_id: 'acc-01', account_name: 'Caisse Centrale Akwa', closure_date: '2026-11-07', opening_balance: 4885000, total_inflow: 0, total_outflow: 85000, theoretical_balance: 4800000, physical_count_balance: 4800000, discrepancy: 0, discrepancy_explanation: 'Comptage physique rigoureusement conforme au solde théorique.', closed_by_name: 'Chantal NGO (Secrétaire)', status: 'validee', created_at: new Date().toISOString() },
];

export const getStoredData = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
};

export const setStoredData = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Storage error', e);
  }
};

export const initLocalDatabase = () => {
  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) setStoredData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  if (!localStorage.getItem(STORAGE_KEYS.ROLES)) setStoredData(STORAGE_KEYS.ROLES, DEFAULT_ROLES);
  if (!localStorage.getItem(STORAGE_KEYS.PERMISSIONS)) setStoredData(STORAGE_KEYS.PERMISSIONS, DEFAULT_PERMISSIONS);
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) setStoredData(STORAGE_KEYS.USERS, INITIAL_USERS);
  if (!localStorage.getItem(STORAGE_KEYS.PARTNERS)) setStoredData(STORAGE_KEYS.PARTNERS, INITIAL_PARTNERS);
  if (!localStorage.getItem(STORAGE_KEYS.CLIENTS)) setStoredData(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS);
  if (!localStorage.getItem(STORAGE_KEYS.LAND_PROPERTIES)) setStoredData(STORAGE_KEYS.LAND_PROPERTIES, INITIAL_LAND_PROPERTIES);
  if (!localStorage.getItem(STORAGE_KEYS.SUBDIVISIONS)) setStoredData(STORAGE_KEYS.SUBDIVISIONS, INITIAL_SUBDIVISIONS);
  if (!localStorage.getItem(STORAGE_KEYS.BLOCKS)) setStoredData(STORAGE_KEYS.BLOCKS, INITIAL_BLOCKS);
  if (!localStorage.getItem(STORAGE_KEYS.PLOTS)) setStoredData(STORAGE_KEYS.PLOTS, INITIAL_PLOTS);
  if (!localStorage.getItem(STORAGE_KEYS.RESERVATIONS)) setStoredData(STORAGE_KEYS.RESERVATIONS, INITIAL_RESERVATIONS);
  if (!localStorage.getItem(STORAGE_KEYS.SALES)) setStoredData(STORAGE_KEYS.SALES, INITIAL_SALES);
  if (!localStorage.getItem(STORAGE_KEYS.RECEIPTS)) setStoredData(STORAGE_KEYS.RECEIPTS, INITIAL_RECEIPTS);
  if (!localStorage.getItem(STORAGE_KEYS.THIRD_PARTY_SETTLEMENTS)) setStoredData(STORAGE_KEYS.THIRD_PARTY_SETTLEMENTS, INITIAL_SETTLEMENTS);
  if (!localStorage.getItem(STORAGE_KEYS.SERVICE_TYPES)) setStoredData(STORAGE_KEYS.SERVICE_TYPES, INITIAL_SERVICE_TYPES);
  if (!localStorage.getItem(STORAGE_KEYS.SERVICE_CASES)) setStoredData(STORAGE_KEYS.SERVICE_CASES, INITIAL_SERVICE_CASES);
  if (!localStorage.getItem(STORAGE_KEYS.FINANCING_CASES)) setStoredData(STORAGE_KEYS.FINANCING_CASES, INITIAL_FINANCING_CASES);
  if (!localStorage.getItem(STORAGE_KEYS.FINANCIAL_ACCOUNTS)) setStoredData(STORAGE_KEYS.FINANCIAL_ACCOUNTS, INITIAL_FINANCIAL_ACCOUNTS);
  if (!localStorage.getItem(STORAGE_KEYS.EXPENSE_REQUESTS)) setStoredData(STORAGE_KEYS.EXPENSE_REQUESTS, INITIAL_EXPENSES);
  if (!localStorage.getItem(STORAGE_KEYS.FINANCIAL_TRANSACTIONS)) setStoredData(STORAGE_KEYS.FINANCIAL_TRANSACTIONS, INITIAL_TRANSACTIONS);
  if (!localStorage.getItem(STORAGE_KEYS.FINANCIAL_TRANSFERS)) setStoredData(STORAGE_KEYS.FINANCIAL_TRANSFERS, INITIAL_TRANSFERS);
  if (!localStorage.getItem(STORAGE_KEYS.CASH_CLOSURES)) setStoredData(STORAGE_KEYS.CASH_CLOSURES, INITIAL_CASH_CLOSURES);
  if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
    setStoredData(STORAGE_KEYS.AUDIT_LOGS, [
      { id: 'log-init-01', user_id: 'user-admin-01', user_email: 'admin@bell-mms.cm', action: 'CREATE', module: 'SYSTEM', entity_name: 'app_settings', entity_id: 'current', old_values: null, new_values: DEFAULT_SETTINGS, ip_address: '127.0.0.1', created_at: new Date().toISOString() } as AuditLogEntry
    ]);
  }
};

export const logAuditEvent = (entry: Omit<AuditLogEntry, 'id' | 'created_at'>) => {
  if (isSupabaseConfigured) return;

  const logs = getStoredData<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  const newEntry: AuditLogEntry = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    created_at: new Date().toISOString(),
  };
  logs.unshift(newEntry);
  setStoredData(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 1000));
};
