-- BELL-MMS : Migration 004 - Schéma Foncier, Lotissements, Parcelles & Clients
-- Contexte : Cameroun (Douala, Yaoundé, Kribi, etc.), titres fonciers, XAF (FCFA)

-- 1. TABLE DES CLIENTS
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- ex: 'CLI-2026-001'
    client_type VARCHAR(20) NOT NULL DEFAULT 'particulier', -- 'particulier' | 'entreprise'
    first_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(200),
    cni_number VARCHAR(100), -- Numéro CNI ou passeport
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100) DEFAULT 'Douala',
    country VARCHAR(100) DEFAULT 'Cameroun',
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_code ON public.clients(code);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients(phone);

-- 2. TABLE DES PARTENAIRES (Propriétaires fonciers, apporteurs d'affaires, géomètres, notaires)
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- ex: 'PAR-2026-001'
    partner_type VARCHAR(50) NOT NULL, -- 'proprietaire_foncier', 'apporteur_affaires', 'geometre', 'notaire', 'banque', 'prestataire'
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100) DEFAULT 'Douala',
    commission_rate NUMERIC(5, 2) DEFAULT 0.00, -- Taux de commission par défaut (%) si apporteur
    bank_details TEXT, -- Coordonnées de règlement
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLE DES TERRAINS / PROPRIÉTÉS FONCIÈRES
CREATE TABLE IF NOT EXISTS public.land_properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'TER-2026-001'
    designation VARCHAR(200) NOT NULL,
    ownership_type VARCHAR(50) NOT NULL DEFAULT 'entreprise', -- 'entreprise' | 'tiers_mandat'
    owner_partner_id UUID REFERENCES public.partners(id) ON DELETE RESTRICT,
    land_title_number VARCHAR(100), -- Numéro de Titre Foncier (ex: TF 12345/Wouri)
    cadastral_reference VARCHAR(100),
    region VARCHAR(100) NOT NULL DEFAULT 'Littoral',
    division VARCHAR(100) NOT NULL DEFAULT 'Wouri', -- Département
    subdivision_name VARCHAR(100) NOT NULL DEFAULT 'Douala 5ème', -- Arrondissement
    locality VARCHAR(150) NOT NULL, -- Quartier / Localité (ex: PK21, Yassa, Japoma)
    total_area_sqm NUMERIC(12, 2) NOT NULL, -- Superficie totale en m²
    purchase_price NUMERIC(15, 2) DEFAULT 0.00, -- Prix d'acquisition ou base mandat en FCFA
    status VARCHAR(50) NOT NULL DEFAULT 'actif', -- 'actif', 'en_lotissement', 'commercialise', 'contentieux'
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    mandate_details JSONB, -- Contrat de mandat (durée, commission %) si tiers
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLE DES LOTISSEMENTS
CREATE TABLE IF NOT EXISTS public.subdivisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    land_property_id UUID NOT NULL REFERENCES public.land_properties(id) ON DELETE CASCADE,
    reference VARCHAR(50) UNIQUE NOT NULL, -- ex: 'LOT-2026-001'
    name VARCHAR(200) NOT NULL,
    total_area_sqm NUMERIC(12, 2) NOT NULL,
    total_plots_count INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'en_cours', -- 'planifie', 'en_cours', 'cloture'
    authorization_number VARCHAR(100), -- Arrêté d'approbation de lotissement (Cameroun)
    authorization_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLE DES BLOCS DE LOTISSEMENT
CREATE TABLE IF NOT EXISTS public.blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subdivision_id UUID NOT NULL REFERENCES public.subdivisions(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL, -- ex: 'Bloc A', 'Bloc B'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLE DES PARCELLES (PLOTS) — PIVOT DE LA GESTION FONCIÈRE
CREATE TABLE IF NOT EXISTS public.plots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subdivision_id UUID NOT NULL REFERENCES public.subdivisions(id) ON DELETE CASCADE,
    block_id UUID REFERENCES public.blocks(id) ON DELETE SET NULL,
    plot_number VARCHAR(50) NOT NULL, -- ex: 'Lot 14'
    area_sqm NUMERIC(10, 2) NOT NULL, -- Superficie m²
    facade_m NUMERIC(8, 2), -- Dimensions façade
    depth_m NUMERIC(8, 2), -- Dimensions profondeur
    price_per_sqm NUMERIC(15, 2) NOT NULL, -- Prix au m² en FCFA
    total_price NUMERIC(15, 2) GENERATED ALWAYS AS (area_sqm * price_per_sqm) STORED,
    status VARCHAR(50) NOT NULL DEFAULT 'disponible', 
    -- 'disponible' | 'reservee' | 'en_cours_de_vente' | 'vendue' | 'bloquee' | 'litige' | 'indisponible'
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    boundary_coordinates JSONB, -- Polygone GeoJSON des limites
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_plot_in_subdivision UNIQUE (subdivision_id, plot_number)
);

CREATE INDEX IF NOT EXISTS idx_plots_status ON public.plots(status);
CREATE INDEX IF NOT EXISTS idx_plots_subdivision_id ON public.plots(subdivision_id);

-- 7. TABLE D'HISTORIQUE DES STATUTS DE PARCELLES (Sécurité foncière & traçabilité anti-double vente)
CREATE TABLE IF NOT EXISTS public.plot_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plot_id UUID NOT NULL REFERENCES public.plots(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. POLITIQUES RLS SUR LE FONCIER ET LES CLIENTS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.land_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subdivisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plot_status_history ENABLE ROW LEVEL SECURITY;

-- Lecture autorisée à tous les utilisateurs avec les permissions adéquates
CREATE POLICY "Lecture des clients autorisée"
ON public.clients FOR SELECT TO authenticated
USING (public.has_permission('clients:read'));

CREATE POLICY "Écriture des clients autorisée"
ON public.clients FOR ALL TO authenticated
USING (public.has_permission('clients:write'));

CREATE POLICY "Lecture des partenaires autorisée"
ON public.partners FOR SELECT TO authenticated
USING (public.has_permission('clients:read'));

CREATE POLICY "Écriture des partenaires autorisée"
ON public.partners FOR ALL TO authenticated
USING (public.has_permission('clients:write'));

CREATE POLICY "Lecture du foncier autorisée"
ON public.land_properties FOR SELECT TO authenticated
USING (public.has_permission('land:read'));

CREATE POLICY "Gestion du foncier autorisée"
ON public.land_properties FOR ALL TO authenticated
USING (public.has_permission('land:write'));

CREATE POLICY "Lecture des subdivisions autorisée"
ON public.subdivisions FOR SELECT TO authenticated
USING (public.has_permission('land:read'));

CREATE POLICY "Gestion des subdivisions autorisée"
ON public.subdivisions FOR ALL TO authenticated
USING (public.has_permission('land:write'));

CREATE POLICY "Lecture des blocs autorisée"
ON public.blocks FOR SELECT TO authenticated
USING (public.has_permission('land:read'));

CREATE POLICY "Gestion des blocs autorisée"
ON public.blocks FOR ALL TO authenticated
USING (public.has_permission('land:write'));

CREATE POLICY "Lecture des parcelles autorisée"
ON public.plots FOR SELECT TO authenticated
USING (public.has_permission('land:read'));

CREATE POLICY "Modification statut parcelles restreinte"
ON public.plots FOR UPDATE TO authenticated
USING (public.has_permission('land:status:change') OR public.has_permission('land:write'));

CREATE POLICY "Historique des parcelles traçable"
ON public.plot_status_history FOR SELECT TO authenticated
USING (public.has_permission('land:read'));

-- 9. TRIGGERS D'AUDIT
DROP TRIGGER IF EXISTS trg_audit_clients ON public.clients;
CREATE TRIGGER trg_audit_clients AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS trg_audit_plots ON public.plots;
CREATE TRIGGER trg_audit_plots AFTER INSERT OR UPDATE OR DELETE ON public.plots
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
