import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TendersPage } from './TendersPage';
import { getStoredData, INITIAL_TENDERS, setStoredData, STORAGE_KEYS } from '../../lib/storage';
import type { Tender } from '../../types/tender.types';

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

const auth = vi.hoisted(() => ({
  currentUser: { id: 'user-sec-01', first_name: 'Chantal', last_name: 'NGO', email: 'secretaire@bell-mms.cm' },
  permissions: [] as string[],
  roles: [] as string[],
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: auth.currentUser,
    hasRole: (codes: string | string[]) =>
      (Array.isArray(codes) ? codes : [codes]).some((code) => auth.roles.includes(code)),
    hasPermission: (code: string) => auth.permissions.includes(code),
    usersList: [
      { id: 'user-sec-01', first_name: 'Chantal', last_name: 'NGO', email: 'secretaire@bell-mms.cm' },
      { id: 'user-collab-01', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'collaborateur@bell-mms.cm' },
    ],
  }),
}));

const readTenders = () => getStoredData<Tender[]>(STORAGE_KEYS.TENDERS, []);

const openDossier = (index: number) => {
  fireEvent.click(screen.getAllByRole('button', { name: /Dossier/ })[index]);
};

beforeEach(() => {
  localStorage.clear();
  setStoredData(STORAGE_KEYS.TENDERS, JSON.parse(JSON.stringify(INITIAL_TENDERS)));
  auth.permissions = ['tenders:manage'];
  auth.roles = ['secretaire'];
});

describe('TendersPage en mode démo', () => {
  it('affiche les marchés locaux avec leur progression de pièces et leurs échéances', () => {
    render(<TendersPage />);

    expect(screen.getByText('AOO-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Viabilisation du lotissement communal de Bonabéri — lot 2')).toBeInTheDocument();
    expect(screen.getByText('7/7 pièces obtenues')).toBeInTheDocument();
    expect(screen.getByText('4/7 pièces obtenues')).toBeInTheDocument();
    expect(screen.getByText('Date dépassée')).toBeInTheDocument();
    expect(screen.getByText(/3 marché\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 échéance\(s\) à tenir/)).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();

    openDossier(1);
    expect(screen.getByText('AOO-2026-0002 · 4/7 pièces obtenues')).toBeInTheDocument();
    expect(screen.getByText('Pièces du dossier')).toBeInTheDocument();
    expect(screen.getByText('Certificat de solvabilité bancaire')).toBeInTheDocument();
    expect(screen.getByText('Aucun ordre de service enregistré pour ce marché.')).toBeInTheDocument();
  });

  it('enregistre un marché créé dans le dépôt local avec son canevas de sept pièces', () => {
    render(<TendersPage />);

    fireEvent.click(screen.getByRole('button', { name: /Suivre un appel d'offres/ }));
    fireEvent.change(screen.getByPlaceholderText('Construction du bloc scolaire de Nkolbesson'), {
      target: { value: 'Réhabilitation du CEG de Nkolbisson' },
    });
    fireEvent.change(screen.getByLabelText("Maître d'ouvrage"), {
      target: { value: 'MINESUP — Délégation Régionale du Littoral' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer et générer le dossier/ }));

    const stored = readTenders();
    expect(stored).toHaveLength(INITIAL_TENDERS.length + 1);
    expect(stored[0].title).toBe('Réhabilitation du CEG de Nkolbisson');
    expect(stored[0].contracting_authority).toBe('MINESUP — Délégation Régionale du Littoral');
    expect(stored[0].reference).toMatch(/^AOO-\d{4}-[A-Z0-9]{8}$/);
    expect(stored[0].status).toBe('veille');
    expect(stored[0].assigned_to).toBe('user-sec-01');
    expect(stored[0].created_by_name).toBe('Chantal NGO');
    expect(stored[0].documents).toHaveLength(7);
    expect(stored[0].documents?.[0]).toMatchObject({
      status: 'a_obtenir',
      tender_id: stored[0].id,
    });
    expect(stored[0].service_orders).toHaveLength(0);

    const audit = getStoredData<Array<{ action: string; entity_name: string }>>(STORAGE_KEYS.AUDIT_LOGS, []);
    expect(audit[0]).toMatchObject({ action: 'CREATE', entity_name: 'tenders' });
  });

  it('refuse la création quand la date limite précède la publication de l’avis', () => {
    render(<TendersPage />);

    fireEvent.click(screen.getByRole('button', { name: /Suivre un appel d'offres/ }));
    fireEvent.change(screen.getByPlaceholderText('Construction du bloc scolaire de Nkolbesson'), {
      target: { value: 'Marché incohérent' },
    });
    fireEvent.change(screen.getByLabelText("Publication de l'avis"), { target: { value: '2026-12-20' } });
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2026-12-10' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer et générer le dossier/ }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/ne peut pas précéder la publication/);
    expect(readTenders()).toHaveLength(INITIAL_TENDERS.length);
  });

  it('fait avancer une pièce du dossier et date son obtention dans le dépôt local', () => {
    render(<TendersPage />);

    openDossier(1);
    fireEvent.click(screen.getByRole('button', { name: 'Faire avancer la pièce Mémoire technique et méthodologie' }));

    expect(screen.getByText('AOO-2026-0002 · 5/7 pièces obtenues')).toBeInTheDocument();

    const tender = readTenders().find((item) => item.id === 'tdr-02');
    const doc = tender?.documents?.find((item) => item.title === 'Mémoire technique et méthodologie');
    expect(doc).toMatchObject({ status: 'obtenu' });
    expect(doc?.obtained_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('enregistre un ordre de service dans le dépôt local', () => {
    render(<TendersPage />);

    openDossier(1);
    fireEvent.change(screen.getByLabelText('Intitulé'), {
      target: { value: 'OS n° 01 — démarrage des travaux' },
    });
    fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '4500000' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));

    const tender = readTenders().find((item) => item.id === 'tdr-02');
    expect(tender?.service_orders).toHaveLength(1);
    expect(tender?.service_orders?.[0]).toMatchObject({
      order_type: 'ordre_service',
      title: 'OS n° 01 — démarrage des travaux',
      amount: 4500000,
      status: 'emis',
      created_by_name: 'Chantal NGO',
    });
    expect(tender?.service_orders?.[0].reference).toMatch(/^OS-\d{4}-[A-Z0-9]{8}$/);
  });

  it('refuse un ordre sans intitulé', () => {
    render(<TendersPage />);

    openDossier(1);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));

    expect(screen.getByRole('alert')).toHaveTextContent(/intitulé de l'ordre/);
    const tender = readTenders().find((item) => item.id === 'tdr-02');
    expect(tender?.service_orders).toHaveLength(0);
  });

  it('fait avancer un ordre de service existant', () => {
    render(<TendersPage />);

    openDossier(0);
    fireEvent.click(screen.getByRole('button', { name: 'Faire avancer OS-2026-0001' }));

    const order = readTenders().find((item) => item.id === 'tdr-01')?.service_orders?.[0];
    expect(order).toMatchObject({ reference: 'OS-2026-0001', status: 'facture' });
  });

  it("restreint l'affichage aux marchés du collaborateur connecté", () => {
    render(<TendersPage />);

    fireEvent.click(screen.getByRole('button', { name: /Mes marchés/ }));

    expect(screen.getByText('AOO-2026-0002')).toBeInTheDocument();
    expect(screen.queryByText('AOO-2026-0001')).not.toBeInTheDocument();
    expect(screen.queryByText('AOO-2026-0003')).not.toBeInTheDocument();
  });

  it('filtre sur les échéances à tenir', () => {
    render(<TendersPage />);

    fireEvent.click(screen.getByRole('button', { name: /Échéances à 15 jours/ }));

    expect(screen.getByText('AOO-2026-0002')).toBeInTheDocument();
    expect(screen.getByText('AOO-2026-0003')).toBeInTheDocument();
    expect(screen.queryByText('AOO-2026-0001')).not.toBeInTheDocument();
  });

  it('reserve la suppression du marché à la direction', () => {
    render(<TendersPage />);
    expect(screen.queryByRole('button', { name: 'Supprimer AOO-2026-0001' })).not.toBeInTheDocument();

    auth.roles = ['directeur_general'];
    render(<TendersPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer AOO-2026-0001' }));

    const stored = readTenders();
    expect(stored).toHaveLength(INITIAL_TENDERS.length - 1);
    expect(stored.some((tender) => tender.id === 'tdr-01')).toBe(false);
  });

  it("refuse l'ouverture d'un dossier sans le droit tenders:manage", () => {
    auth.permissions = [];

    render(<TendersPage />);

    expect(screen.queryByRole('button', { name: /Suivre un appel d'offres/ })).not.toBeInTheDocument();
    expect(screen.getByText(/réservées aux porteurs du droit/)).toBeInTheDocument();
    expect(screen.getByText('AOO-2026-0001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument();
  });
});
