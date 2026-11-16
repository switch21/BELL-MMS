import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TendersPage } from './TendersPage';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    errors: {} as Record<string, { message: string } | null>,
    inserts: [] as Array<{ table: string; payload: any }>,
    updates: [] as Array<{ table: string; payload: any; id: string }>,
    deletes: [] as Array<{ table: string; id: string }>,
  };

  const read = (table: string) =>
    Promise.resolve({ data: state.tables[table] ?? [], error: state.errors[table] ?? null });

  const from = vi.fn((table: string) => ({
    select: () => ({
      order: () => read(table),
      eq: () => read(table),
    }),
    insert: (payload: any) => {
      state.inserts.push({ table, payload });
      const row = Array.isArray(payload) ? null : { id: 'tdr-new-1', ...payload };
      return {
        select: () => Promise.resolve({ data: row ? [row] : [], error: state.errors[table] ?? null }),
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: null, error: state.errors[table] ?? null }),
      };
    },
    update: (payload: any) => ({
      eq: (_column: string, id: string) => {
        state.updates.push({ table, payload, id });
        return Promise.resolve({ data: null, error: state.errors[table] ?? null });
      },
    }),
    delete: () => ({
      eq: (_column: string, id: string) => {
        state.deletes.push({ table, id });
        return Promise.resolve({ data: null, error: state.errors[table] ?? null });
      },
    }),
  }));

  return { state, from };
});

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mockDb.from },
}));

const auth = vi.hoisted(() => ({
  canManage: true,
  director: false,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-1', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'emmanuel@bell-mms.local' },
    hasRole: () => auth.director,
    hasPermission: (code: string) => auth.canManage && code === 'tenders:manage',
    usersList: [],
  }),
}));

const TENDER_ROW = {
  id: 'tdr-1',
  reference: 'AOO-2026-BB11CC22',
  title: 'Construction du bloc administratif de Douala',
  contracting_authority: 'COMMUNE DE DOUALA — Service Technique',
  source: 'ARMP — avis n°021/AONO/CUD/2026',
  tender_method: 'appel_offres',
  status: 'soumission',
  estimated_amount: 112000000,
  caution_amount: 1680000,
  bid_amount: 96500000,
  contract_number: null,
  awarded_at: null,
  contract_signed_at: null,
  advance_payment_rate: 15,
  publication_date: '2026-10-01',
  deadline: '2027-06-30',
  execution_delay_days: 240,
  site_location: 'Douala 5ème',
  assigned_to: 'user-1',
  assigned_to_name: 'Emmanuel FOTSO',
  created_by: 'user-1',
  created_by_name: 'Emmanuel FOTSO',
  notes: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const DOC_ROWS = [
  {
    id: 'doc-1',
    tender_id: 'tdr-1',
    title: 'Registre de commerce',
    category: 'administratif',
    status: 'valide',
    obtained_at: '2026-10-05',
    valid_until: '2027-01-05',
    notes: null,
    created_by: 'user-1',
    created_by_name: 'Emmanuel FOTSO',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-05T00:00:00Z',
  },
  {
    id: 'doc-2',
    tender_id: 'tdr-1',
    title: 'Certificat de solvabilité bancaire',
    category: 'financier',
    status: 'en_cours',
    obtained_at: null,
    valid_until: null,
    notes: null,
    created_by: 'user-1',
    created_by_name: 'Emmanuel FOTSO',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
];

const ORDER_ROWS = [
  {
    id: 'so-1',
    tender_id: 'tdr-1',
    reference: 'OS-2026-0001',
    order_type: 'ordre_service',
    title: 'Ordre de service de démarrage',
    issued_on: '2026-10-02',
    amount: null,
    status: 'emis',
    notes: null,
    created_by: 'user-1',
    created_by_name: 'Emmanuel FOTSO',
    created_at: '2026-10-02T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
  },
  {
    id: 'so-2',
    tender_id: 'tdr-1',
    reference: 'DEC-2026-0001',
    order_type: 'decompte',
    title: 'Décompte provisoire n°01',
    issued_on: '2026-10-20',
    amount: 12500000,
    status: 'facture',
    notes: null,
    created_by: 'user-1',
    created_by_name: 'Emmanuel FOTSO',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  },
];

const openDossier = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Dossier/ }));
};

beforeEach(() => {
  mockDb.state.tables = {
    tenders: [TENDER_ROW],
    tender_documents: DOC_ROWS,
    tender_service_orders: ORDER_ROWS,
    profiles: [{ id: 'user-1', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'emmanuel@bell-mms.local' }],
  };
  mockDb.state.errors = {};
  mockDb.state.inserts.length = 0;
  mockDb.state.updates.length = 0;
  mockDb.state.deletes.length = 0;
  auth.canManage = true;
  auth.director = false;
});

describe('TendersPage en mode connecté', () => {
  it('charge les marchés, les pièces du dossier et les ordres depuis Supabase', async () => {
    render(<TendersPage />);

    expect(await screen.findByText('AOO-2026-BB11CC22')).toBeInTheDocument();
    expect(screen.getByText('Construction du bloc administratif de Douala')).toBeInTheDocument();
    expect(screen.getByText('1/2 pièces obtenues')).toBeInTheDocument();
    expect(screen.getByText(/2 ordre\(s\) ·/)).toBeInTheDocument();
    expect(screen.queryByText('Module non raccordé à Supabase')).not.toBeInTheDocument();

    await openDossier();
    expect(screen.getByText('Registre de commerce')).toBeInTheDocument();
    expect(screen.getByText(/obtenue le 05\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Ordres de service, avenants et décomptes')).toBeInTheDocument();
  });

  it('affiche une erreur explicite quand le chargement échoue', async () => {
    mockDb.state.errors = { tenders: { message: 'permission denied for table tenders' } };

    render(<TendersPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les marchés publics depuis Supabase');
  });

  it('crée le marché puis génère les sept pièces du canevas en tender_documents', async () => {
    render(<TendersPage />);
    await screen.findByText('AOO-2026-BB11CC22');

    fireEvent.click(screen.getByRole('button', { name: /Suivre un appel d'offres/ }));
    fireEvent.change(screen.getByPlaceholderText('Construction du bloc scolaire de Nkolbesson'), {
      target: { value: 'Aménagement de la voirie de Kribi' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer et générer le dossier/ }));

    await waitFor(() => expect(mockDb.state.inserts).toHaveLength(2));

    const [tenderInsert, docsInsert] = mockDb.state.inserts;
    expect(tenderInsert.table).toBe('tenders');
    expect(tenderInsert.payload).toMatchObject({
      title: 'Aménagement de la voirie de Kribi',
      tender_method: 'appel_offres',
      status: 'veille',
      assigned_to: 'user-1',
      created_by: 'user-1',
      created_by_name: 'Emmanuel FOTSO',
    });
    expect(tenderInsert.payload.reference).toMatch(/^AOO-\d{4}-[A-Z0-9]{8}$/);

    expect(docsInsert.table).toBe('tender_documents');
    expect(docsInsert.payload).toHaveLength(7);
    expect(docsInsert.payload[0]).toMatchObject({ tender_id: 'tdr-new-1', status: 'a_obtenir' });
    expect(docsInsert.payload[6].title).toBe("Planning d'exécution");
  });

  it('refuse la création quand la date limite précède la publication de l’avis', async () => {
    render(<TendersPage />);
    await screen.findByText('AOO-2026-BB11CC22');

    fireEvent.click(screen.getByRole('button', { name: /Suivre un appel d'offres/ }));
    fireEvent.change(screen.getByPlaceholderText('Construction du bloc scolaire de Nkolbesson'), {
      target: { value: 'Marché incohérent' },
    });
    fireEvent.change(screen.getByLabelText("Publication de l'avis"), { target: { value: '2027-01-20' } });
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2027-01-10' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer et générer le dossier/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/ne peut pas précéder la publication/);
    expect(mockDb.state.inserts).toHaveLength(0);
  });

  it('fait avancer le statut du marché dans la table tenders', async () => {
    render(<TendersPage />);
    await screen.findByText('AOO-2026-BB11CC22');

    fireEvent.click(screen.getByRole('button', { name: 'Adjugé' }));

    await waitFor(() => expect(mockDb.state.updates).toHaveLength(1));
    expect(mockDb.state.updates[0]).toMatchObject({ table: 'tenders', id: 'tdr-1' });
    expect(mockDb.state.updates[0].payload).toMatchObject({ status: 'adjudique' });
  });

  it('fait avancer une pièce du dossier dans tender_documents', async () => {
    render(<TendersPage />);
    await openDossier();

    fireEvent.click(
      screen.getByRole('button', { name: 'Faire avancer la pièce Certificat de solvabilité bancaire' })
    );

    await waitFor(() => expect(mockDb.state.updates).toHaveLength(1));
    expect(mockDb.state.updates[0]).toMatchObject({ table: 'tender_documents', id: 'doc-2' });
    expect(mockDb.state.updates[0].payload).toMatchObject({ status: 'obtenu' });
    expect(mockDb.state.updates[0].payload.obtained_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fait avancer un ordre de service dans tender_service_orders', async () => {
    render(<TendersPage />);
    await openDossier();

    fireEvent.click(screen.getByRole('button', { name: 'Faire avancer OS-2026-0001' }));

    await waitFor(() => expect(mockDb.state.updates).toHaveLength(1));
    expect(mockDb.state.updates[0]).toMatchObject({ table: 'tender_service_orders', id: 'so-1' });
    expect(mockDb.state.updates[0].payload).toMatchObject({ status: 'notifie' });
  });

  it('enregistre un décompte avec sa référence et son montant', async () => {
    render(<TendersPage />);
    await openDossier();

    fireEvent.change(screen.getByLabelText("Nature de l'ordre"), { target: { value: 'decompte' } });
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Décompte définitif n°02' } });
    fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '8900000' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await waitFor(() => expect(mockDb.state.inserts).toHaveLength(1));
    expect(mockDb.state.inserts[0].table).toBe('tender_service_orders');
    expect(mockDb.state.inserts[0].payload).toMatchObject({
      tender_id: 'tdr-1',
      order_type: 'decompte',
      title: 'Décompte définitif n°02',
      amount: 8900000,
      status: 'emis',
    });
    expect(mockDb.state.inserts[0].payload.reference).toMatch(/^DEC-\d{4}-[A-Z0-9]{8}$/);
  });

  it('ajoute une pièce libre au dossier', async () => {
    render(<TendersPage />);
    await openDossier();

    fireEvent.change(screen.getByLabelText('Ajouter une pièce'), {
      target: { value: 'Attestation de non-imposition de moins de trois mois' },
    });
    fireEvent.change(screen.getByLabelText('Catégorie de la pièce'), { target: { value: 'financier' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

    await waitFor(() => expect(mockDb.state.inserts).toHaveLength(1));
    expect(mockDb.state.inserts[0].table).toBe('tender_documents');
    expect(mockDb.state.inserts[0].payload).toMatchObject({
      tender_id: 'tdr-1',
      title: 'Attestation de non-imposition de moins de trois mois',
      category: 'financier',
      status: 'a_obtenir',
    });
  });

  it('reserve la création aux porteurs du droit tenders:manage', async () => {
    auth.canManage = false;

    render(<TendersPage />);
    await screen.findByText('AOO-2026-BB11CC22');

    expect(screen.queryByRole('button', { name: /Suivre un appel d'offres/ })).not.toBeInTheDocument();
    expect(screen.getByText(/réservées aux porteurs du droit/)).toBeInTheDocument();

    await openDossier();
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Faire avancer la pièce Certificat de solvabilité bancaire' })
    ).not.toBeInTheDocument();
  });

  it('reserve la suppression du marché à la direction', async () => {
    render(<TendersPage />);
    await screen.findByText('AOO-2026-BB11CC22');
    expect(screen.queryByRole('button', { name: 'Supprimer AOO-2026-BB11CC22' })).not.toBeInTheDocument();

    auth.director = true;
    render(<TendersPage />);
    await screen.findByText('AOO-2026-BB11CC22');

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer AOO-2026-BB11CC22' }));
    await waitFor(() => expect(mockDb.state.deletes).toHaveLength(1));
    expect(mockDb.state.deletes[0]).toMatchObject({ table: 'tenders', id: 'tdr-1' });
  });
});
