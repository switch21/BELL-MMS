export type PlotStatus =
  | 'disponible'
  | 'reservee'
  | 'en_cours_de_vente'
  | 'vendue'
  | 'bloquee'
  | 'litige'
  | 'indisponible';

export type OwnershipType = 'entreprise' | 'tiers_mandat';

export interface Client {
  id: string;
  code: string;
  client_type: 'particulier' | 'entreprise';
  first_name?: string;
  last_name: string;
  company_name?: string;
  cni_number?: string;
  phone: string;
  email?: string;
  address?: string;
  city: string;
  country: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  code: string;
  partner_type:
    | 'proprietaire_foncier'
    | 'apporteur_affaires'
    | 'geometre'
    | 'notaire'
    | 'banque'
    | 'prestataire';
  name: string;
  contact_person?: string;
  phone: string;
  email?: string;
  address?: string;
  city: string;
  commission_rate: number;
  bank_details?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LandProperty {
  id: string;
  reference: string;
  designation: string;
  ownership_type: OwnershipType;
  owner_partner_id?: string;
  owner_partner?: Partner;
  land_title_number?: string;
  cadastral_reference?: string;
  region: string;
  division: string;
  subdivision_name: string;
  locality: string;
  total_area_sqm: number;
  purchase_price: number;
  status: 'actif' | 'en_lotissement' | 'commercialise' | 'contentieux';
  latitude: number;
  longitude: number;
  mandate_details?: {
    duration_months?: number;
    commission_percentage?: number;
    reference_price_sqm?: number;
    start_date?: string;
  };
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Subdivision {
  id: string;
  land_property_id: string;
  reference: string;
  name: string;
  total_area_sqm: number;
  total_plots_count: number;
  status: 'planifie' | 'en_cours' | 'cloture';
  authorization_number?: string;
  authorization_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Block {
  id: string;
  subdivision_id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Plot {
  id: string;
  subdivision_id: string;
  block_id?: string;
  block?: Block;
  plot_number: string;
  area_sqm: number;
  facade_m?: number;
  depth_m?: number;
  price_per_sqm: number;
  total_price: number;
  status: PlotStatus;
  latitude: number;
  longitude: number;
  boundary_coordinates?: [number, number][]; // Coordonnées du polygone pour Leaflet
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PlotStatusHistory {
  id: string;
  plot_id: string;
  old_status?: PlotStatus;
  new_status: PlotStatus;
  reason: string;
  changed_by?: string;
  changed_at: string;
}
