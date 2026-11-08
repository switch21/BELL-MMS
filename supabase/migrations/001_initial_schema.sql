-- BELL-MMS : Migration 001 - Schéma Initial (Socle & Administration)
-- Contexte : Entreprise camerounaise, devises en XAF, rôles et permissions stricts

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLE DES RÔLES
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertion des rôles système par défaut
INSERT INTO public.roles (code, name, description, is_system) VALUES
('super_admin', 'Super Administrateur', 'Accès technique total, maintenance et configuration système', true),
('directeur_general', 'Directeur Général', 'Supervision globale, validations stratégiques et financières', true),
('secretaire', 'Secrétaire', 'Gestion administrative, accueil clients, courriers et dossiers', true),
('collaborateur', 'Collaborateur', 'Exécution opérationnelle des dossiers et des tâches assignées', true)
ON CONFLICT (code) DO NOTHING;

-- 3. TABLE DES PERMISSIONS
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertion des permissions initiales
INSERT INTO public.permissions (code, module, name, description) VALUES
-- Administration & Système
('admin:settings:read', 'admin', 'Consulter les paramètres système', 'Accès aux paramètres généraux de l''entreprise'),
('admin:settings:write', 'admin', 'Modifier les paramètres système', 'Modification de la configuration générale'),
('admin:users:manage', 'admin', 'Gérer les utilisateurs', 'Création, modification et désactivation des comptes'),
('admin:roles:manage', 'admin', 'Gérer les rôles et permissions', 'Attribution et personnalisation des privilèges'),
('admin:audit:read', 'admin', 'Consulter le journal d''audit', 'Accès aux journaux de sécurité et d''opérations'),

-- Tableau de bord
('dashboard:dg:view', 'dashboard', 'Consulter le tableau de bord DG', 'Vision globale stratégique et financière'),
('dashboard:secretaire:view', 'dashboard', 'Consulter le tableau de bord Secrétariat', 'Vision administrative et courriers'),
('dashboard:collaborateur:view', 'dashboard', 'Consulter le tableau de bord Collaborateur', 'Suivi des tâches et dossiers affectés'),

-- Foncier, Terrains & Lotissements
('land:read', 'land', 'Consulter le patrimoine foncier', 'Visualiser les terrains, lotissements et parcelles'),
('land:write', 'land', 'Gérer le patrimoine foncier', 'Ajouter ou modifier des terrains, lotissements et parcelles'),
('land:status:change', 'land', 'Changer le statut d''une parcelle', 'Bloquer, débloquer ou marquer en litige'),

-- Ventes & Réservations
('sales:read', 'sales', 'Consulter les ventes et réservations', 'Voir les fiches de vente, clients et échéances'),
('sales:create', 'sales', 'Créer une réservation ou une vente', 'Initier une vente au comptant ou échelonnée'),
('sales:validate', 'sales', 'Valider définitivement une vente', 'Validation requérant autorisations de direction'),
('sales:cancel', 'sales', 'Annuler une vente ou réservation', 'Procédure formelle d''annulation'),

-- Clients & Partenaires
('clients:read', 'clients', 'Consulter les clients et partenaires', 'Accès au carnet d''adresses et fiches'),
('clients:write', 'clients', 'Gérer les clients et partenaires', 'Création et mise à jour des coordonnées'),

-- Prestations & Dossiers administratifs
('services:read', 'services', 'Consulter les dossiers de prestations', 'Suivi des mutations, jugements et démarches'),
('services:write', 'services', 'Traiter les dossiers de prestations', 'Ajouter des pièces et faire avancer les étapes'),
('services:validate', 'services', 'Valider et clôturer un dossier', 'Approbation finale d''un dossier'),

-- Finances & Trésorerie
('finance:read', 'finance', 'Consulter la trésorerie et les finances', 'Vue sur les soldes des caisses et comptes bancaires'),
('finance:expense:request', 'finance', 'Initier une demande de dépense', 'Soumettre une demande avec motif et justificatif'),
('finance:expense:approve', 'finance', 'Approuver les dépenses', 'Validation financière selon seuils d''autorisation'),
('finance:cash:manage', 'finance', 'Gérer les caisses et transferts', 'Enregistrement des entrées/sorties et clôtures journalières'),
('finance:reports:export', 'finance', 'Exporter les rapports financiers', 'Génération d''états de trésorerie et bilans périodiques'),

-- Travaux & Marchés Publics
('projects:manage', 'projects', 'Gérer les travaux et chantiers', 'Suivi de la viabilisation et des prestataires'),
('tenders:manage', 'tenders', 'Gérer les marchés publics', 'Soumissions, décomptes et suivi contractuel')
ON CONFLICT (code) DO NOTHING;

-- 4. TABLE DE LIAISON RÔLES - PERMISSIONS
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- 5. TABLE DES PROFILS UTILISATEURS (Liée à auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    role_id UUID REFERENCES public.roles(id) ON DELETE RESTRICT,
    job_title VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    theme_preference VARCHAR(20) DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- 6. TABLE DES JOURNAUX D'AUDIT (Traçabilité stricte - immuable)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    action VARCHAR(50) NOT NULL, -- ex: 'CREATE', 'UPDATE', 'DELETE', 'VALIDATE', 'LOGIN'
    module VARCHAR(50) NOT NULL, -- ex: 'AUTH', 'FINANCE', 'SALES', 'LAND'
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON public.audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- 7. TABLE DES PARAMÈTRES GLOBAUX DE L'ENTREPRISE
CREATE TABLE IF NOT EXISTS public.app_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'current',
    company_name VARCHAR(200) NOT NULL DEFAULT 'BELL ENTERPRISE SARL',
    legal_form VARCHAR(50) DEFAULT 'SARL',
    rccm VARCHAR(100),
    niu VARCHAR(100), -- Numéro d'Identifiant Unique (Cameroun)
    address TEXT DEFAULT 'Douala, Cameroun',
    phone VARCHAR(50) DEFAULT '+237 600 00 00 00',
    email VARCHAR(150) DEFAULT 'contact@bell-mms.cm',
    currency VARCHAR(10) DEFAULT 'XAF',
    currency_symbol VARCHAR(10) DEFAULT 'FCFA',
    default_reservation_duration_days INTEGER DEFAULT 14,
    expense_approval_threshold_dg NUMERIC(15, 2) DEFAULT 250000.00, -- Seuil à partir duquel la validation DG est requise
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertion de la ligne unique de paramétrage
INSERT INTO public.app_settings (id, company_name)
VALUES ('current', 'BELL MULTI-MANAGEMENT SYSTEM')
ON CONFLICT (id) DO NOTHING;

-- Initialisation des permissions par défaut pour les rôles
DO $$
DECLARE
    r_super_admin UUID;
    r_dg UUID;
    r_secretaire UUID;
    r_collab UUID;
BEGIN
    SELECT id INTO r_super_admin FROM public.roles WHERE code = 'super_admin';
    SELECT id INTO r_dg FROM public.roles WHERE code = 'directeur_general';
    SELECT id INTO r_secretaire FROM public.roles WHERE code = 'secretaire';
    SELECT id INTO r_collab FROM public.roles WHERE code = 'collaborateur';

    -- Super Admin : toutes les permissions
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_super_admin, id FROM public.permissions
    ON CONFLICT DO NOTHING;

    -- Directeur Général : Tout sauf gestion système avancée
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_dg, id FROM public.permissions 
    WHERE code NOT IN ('admin:users:manage', 'admin:roles:manage', 'admin:settings:write')
    ON CONFLICT DO NOTHING;

    -- Secrétaire : clients, ventes création, dashboard secretaire, services read/write
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_secretaire, id FROM public.permissions
    WHERE code IN (
        'dashboard:secretaire:view',
        'clients:read', 'clients:write',
        'land:read',
        'sales:read', 'sales:create',
        'services:read', 'services:write',
        'finance:expense:request'
    )
    ON CONFLICT DO NOTHING;

    -- Collaborateur : mes dossiers, mes tâches, mes requêtes de dépense
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r_collab, id FROM public.permissions
    WHERE code IN (
        'dashboard:collaborateur:view',
        'clients:read',
        'land:read',
        'services:read', 'services:write',
        'finance:expense:request'
    )
    ON CONFLICT DO NOTHING;
END $$;
