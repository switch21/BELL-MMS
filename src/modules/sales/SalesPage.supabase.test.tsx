import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SalesPage } from './SalesPage';

const mockDb = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, any[]>,
    rpcCalls: [] as Array<{ fn: string; args: any }>,
    rpcResults: {} as Record<string, any>,
  };

  const from = vi.fn((table: string) => {
    const filters: Record<string, string> = {};
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({
        data: (state.tables[table] ?? []).find((row) =>
          Object.entries(filters).every(([column, value]) => row[column] === value)
        ) ?? null,
        error: null,
      }),
      then: (onFulfilled: (value: { data: any[]; error: null }) => any) =>
        Promise.resolve({ data: state.tables[table] ?? [], error: null }).then(onFulfilled),
    };
    return builder;
  });

  const rpc = vi.fn((fn: string, args: any) => {
    state.rpcCalls.push({ fn, args });
    return Promise.resolve({ data: state.rpcResults[fn] ?? null, error: null });
  });

  return { state, from, rpc };
});

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: mockDb.from, rpc: mockDb.rpc },
}));

vi.mock('../../lib/pdf-generator', () => ({ generateReceiptPDF: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-dg', first_name: 'Emmanuel', last_name: 'FOTSO', email: 'dg@bell-mms.local' },
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

// Mêmes bornes que le composant : la convertible est jugée sur la date locale du jour.
const day = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split('T')[0];
};

const CLIENT = {
  id: 'cli-1',
  code: 'CLI-2026-TEST01',
  client_type: 'particulier',
  first_name: 'Anne',
  last_name: 'MBARGA',
  created_at: '2026-11-01T08:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
};

const PLOT_BASE = {
  area_sqm: 500,
  price_per_sqm: 30000,
  total_price: 15000000,
  created_at: '2026-11-01T08:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
};

const PLOT_FREE = { ...PLOT_BASE, id: 'plot-libre', plot_number: 'TEST-LOT-LIBRE', status: 'disponible' };
const PLOT_RESERVED = { ...PLOT_BASE, id: 'plot-reservee', plot_number: 'TEST-LOT-RES', status: 'reservee' };
const PLOT_EXPIRED = { ...PLOT_BASE, id: 'plot-perimee', plot_number: 'TEST-LOT-PERIME', status: 'reservee' };

const CREATED_SALE = {
  id: 'sale-new',
  reference: 'VTE-2026-ABC12345',
  client_id: 'cli-1',
  plot_id: 'plot-reservee',
  reservation_id: 'res-active',
  sale_type: 'comptant',
  sale_date: day(0),
  total_price: 15000000,
  discount_amount: 0,
  final_price: 15000000,
  initial_deposit: 15000000,
  remaining_balance: 0,
  payment_method: 'virement',
  status: 'soldee',
  schedules: [],
  receipts: [],
  created_at: '2026-11-15T10:00:00Z',
  updated_at: '2026-11-15T10:00:00Z',
};

const RESERVATIONS = [
  {
    id: 'res-active',
    reference: 'RES-2026-ACTIVE',
    client_id: 'cli-1',
    plot_id: 'plot-reservee',
    agreed_price: 15000000,
    deposit_amount: 1000000,
    reservation_date: day(-7),
    duration_days: 14,
    expiration_date: day(7),
    status: 'active',
    created_at: '2026-11-08T08:00:00Z',
    updated_at: '2026-11-08T08:00:00Z',
  },
  {
    id: 'res-expired',
    reference: 'RES-2026-PERIME',
    client_id: 'cli-1',
    plot_id: 'plot-perimee',
    agreed_price: 15000000,
    deposit_amount: 1000000,
    reservation_date: day(-30),
    duration_days: 14,
    expiration_date: day(-16),
    status: 'active',
    created_at: '2026-10-16T08:00:00Z',
    updated_at: '2026-10-16T08:00:00Z',
  },
];

/** Sélecteurs de la modale de vente : client, parcelle, mode de règlement (le 4e n'apparaît qu'en échelonné). */
const saleFormSelects = () => {
  const [clientSelect, plotSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
  return { clientSelect, plotSelect };
};

const openReservationTab = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Réservations en Cours/ }));
  await screen.findByText('RES-2026-ACTIVE');
};

const rowOf = (reference: string) => screen.getByText(reference).closest('tr') as HTMLElement;

beforeEach(() => {
  mockDb.state.tables = {
    clients: [CLIENT],
    plots: [PLOT_FREE, PLOT_RESERVED, PLOT_EXPIRED],
    sales: [],
    reservations: RESERVATIONS,
    receipts: [{ id: 'rec-new', reference: 'REC-2026-ZZZ111', sale_id: 'sale-new', amount: 15000000 }],
  };
  mockDb.state.rpcCalls.length = 0;
  mockDb.state.rpcResults = { create_sale: CREATED_SALE };
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('SalesPage en mode connecté — conversion réservation → vente', () => {
  it('propose la conversion sur une réservation active et pas sur une réservation expirée', async () => {
    render(<SalesPage />);
    await openReservationTab();

    expect(rowOf('RES-2026-ACTIVE').querySelector('button')?.textContent).toContain('Convertir en vente');
    expect(rowOf('RES-2026-PERIME').querySelector('button')).toBeNull();
  });

  it('convertit la réservation en vente en transmettant son identifiant à create_sale', async () => {
    render(<SalesPage />);
    await openReservationTab();

    fireEvent.click(rowOf('RES-2026-ACTIVE').querySelector('button') as HTMLElement);
    expect(await screen.findByText('Conversion de la réservation RES-2026-ACTIVE')).toBeInTheDocument();
    expect(
      screen.getByText(/imputé sur le prix/i)
    ).toBeInTheDocument();

    const { clientSelect, plotSelect } = saleFormSelects();
    expect(plotSelect).toHaveValue('plot-reservee');
    expect(clientSelect).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Valider la Vente/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));
    expect(mockDb.state.rpcCalls[0].fn).toBe('create_sale');
    // 022 : le comptant d'une conversion ne verse que le complément, l'acompte de 1 000 000 est imputé.
    expect(mockDb.state.rpcCalls[0].args).toMatchObject({
      p_client_id: 'cli-1',
      p_plot_id: 'plot-reservee',
      p_reservation_id: 'res-active',
      p_sale_type: 'comptant',
      p_initial_deposit: 14000000,
    });
  });

  it('laisse le comptant d une parcelle libre au prix entier et l echeancier sur l apport saisi', async () => {
    render(<SalesPage />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Nouvelle Vente/ }));
    await screen.findByText('Enregistrer une Vente Immobilière');

    const { plotSelect } = saleFormSelects();
    fireEvent.change(plotSelect, { target: { value: 'plot-libre' } });
    fireEvent.click(screen.getByRole('button', { name: /Valider la Vente/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));
    expect(mockDb.state.rpcCalls[0].args).toMatchObject({
      p_plot_id: 'plot-libre',
      p_reservation_id: null,
      p_sale_type: 'comptant',
      p_initial_deposit: 15000000,
    });

    mockDb.state.rpcCalls.length = 0;
    fireEvent.click(screen.getByRole('button', { name: /Nouvelle Vente/ }));
    await screen.findByText('Enregistrer une Vente Immobilière');

    const again = saleFormSelects();
    fireEvent.change(again.plotSelect, { target: { value: 'plot-reservee' } });
    await screen.findByText('Conversion de la réservation RES-2026-ACTIVE');
    fireEvent.click(screen.getByRole('radio', { name: /Vente Échelonnée/ }));
    fireEvent.change(screen.getByLabelText(/Apport Initial/), { target: { value: '2000000' } });
    fireEvent.click(screen.getByRole('button', { name: /Valider la Vente/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));
    expect(mockDb.state.rpcCalls[0].args).toMatchObject({
      p_reservation_id: 'res-active',
      p_sale_type: 'echelonne',
      p_initial_deposit: 2000000,
      p_installments_count: 6,
    });
  });

  it('lie et délie la réservation depuis le sélecteur de parcelles, et envoie null pour une parcelle libre', async () => {
    render(<SalesPage />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Nouvelle Vente/ }));
    await screen.findByText('Enregistrer une Vente Immobilière');

    const { clientSelect, plotSelect } = saleFormSelects();
    expect(plotSelect).toHaveValue('plot-libre');
    expect(Array.from(plotSelect.options).map((o) => o.value)).not.toContain('plot-perimee');

    fireEvent.change(plotSelect, { target: { value: 'plot-reservee' } });
    expect(await screen.findByText('Conversion de la réservation RES-2026-ACTIVE')).toBeInTheDocument();
    expect(clientSelect).toBeDisabled();

    fireEvent.change(plotSelect, { target: { value: 'plot-libre' } });
    expect(screen.queryByText(/Conversion de la réservation/)).not.toBeInTheDocument();
    expect(clientSelect).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Valider la Vente/ }));

    await waitFor(() => expect(mockDb.state.rpcCalls).toHaveLength(1));
    expect(mockDb.state.rpcCalls[0].args).toMatchObject({
      p_plot_id: 'plot-libre',
      p_reservation_id: null,
    });
  });
});
