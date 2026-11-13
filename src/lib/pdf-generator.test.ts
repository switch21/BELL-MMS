import { beforeEach, describe, expect, it, vi } from 'vitest';
import autoTable from 'jspdf-autotable';
import { generateFinancialReportPDF, generateReceiptPDF, type FinancialReportData } from './pdf-generator';
import type { FinancialAccount, FinancialTransaction } from '../types/finance.types';
import type { Receipt, Sale } from '../types/sales.types';

const hoisted = vi.hoisted(() => ({ save: vi.fn(), text: vi.fn() }));

vi.mock('jspdf', () => ({
  default: class MockJsPDF {
    lastAutoTable = { finalY: 100 };
    setFillColor = () => {};
    rect = () => {};
    setTextColor = () => {};
    setFontSize = () => {};
    setFont = () => {};
    text = hoisted.text;
    setDrawColor = () => {};
    save = hoisted.save;
  },
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

const normalize = (value: unknown) => JSON.stringify(value).replace(/\s/g, ' ');

const tableBody = (callIndex: number): string[][] =>
  (vi.mocked(autoTable).mock.calls[callIndex][1] as unknown as { body: string[][] }).body;

const accounts: FinancialAccount[] = [
  {
    id: 'acc-1',
    code: 'CAISSE-01',
    name: 'Caisse Centrale Akwa',
    account_type: 'caisse',
    currency: 'XAF',
    initial_balance: 0,
    current_balance: 4800000,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const transactions: FinancialTransaction[] = Array.from({ length: 12 }, (_, index) => ({
  id: `trx-${index}`,
  reference: `TRX-${index}`,
  account_id: 'acc-1',
  account_name: 'Caisse Centrale Akwa',
  transaction_type: 'recette',
  amount: (index + 1) * 1000,
  transaction_date: '2026-11-01',
  beneficiary_or_payer: 'Client',
  description: `Mouvement ${index}`,
  balance_after: (index + 1) * 1000,
  created_at: '2026-11-01T00:00:00Z',
}));

const reportData: FinancialReportData = {
  accounts,
  transactions,
  totalCash: 4800000,
  totalBank: 28200000,
  totalTreasury: 33000000,
  totalReceivables: 13000000,
  totalPayables: 5840000,
  totalGrossMargin: 3660000,
  generatedByName: 'Paul BELL',
  periodLabel: 'Novembre 2026',
};

const receipt: Receipt = {
  id: 'rec-1',
  reference: 'REC-2026-001',
  sale_id: 'sale-1',
  amount: 5000000,
  payment_date: '2026-11-01',
  payment_method: 'virement',
  transaction_ref: 'VIR-001',
  received_by_name: 'Paul BELL',
  created_at: '2026-11-01T00:00:00Z',
};

const sale: Sale = {
  id: 'sale-1',
  reference: 'VTE-2026-001',
  client_id: 'cli-1',
  plot_id: 'plot-1',
  sale_type: 'echelonne',
  sale_date: '2026-10-01',
  total_price: 18000000,
  discount_amount: 0,
  final_price: 18000000,
  initial_deposit: 5000000,
  remaining_balance: 13000000,
  payment_method: 'virement',
  status: 'en_cours',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

describe('generateFinancialReportPDF', () => {
  beforeEach(() => {
    vi.mocked(autoTable).mockClear();
    hoisted.save.mockClear();
  });

  it('produit les trois tableaux avec les montants consolidés', () => {
    generateFinancialReportPDF(reportData);

    expect(vi.mocked(autoTable)).toHaveBeenCalledTimes(3);

    const synthesis = tableBody(0);
    expect(normalize(synthesis)).toContain('Trésorerie Totale Disponible');
    expect(normalize(synthesis)).toContain('33 000 000 FCFA');
    expect(normalize(synthesis)).toContain('5 840 000 FCFA');

    const accountRows = tableBody(1);
    expect(accountRows).toHaveLength(1);
    expect(accountRows[0]).toContain('CAISSE-01');
    expect(normalize(accountRows[0])).toContain('4 800 000 FCFA');
  });

  it('limite le journal des mouvements aux 10 dernières lignes', () => {
    generateFinancialReportPDF(reportData);

    const journal = tableBody(2);
    expect(journal).toHaveLength(10);
    expect(journal[0][0]).toBe('TRX-0');
    expect(journal[9][0]).toBe('TRX-9');
  });

  it('nomme le fichier PDF avec la date d’édition', () => {
    generateFinancialReportPDF(reportData);

    expect(hoisted.save).toHaveBeenCalledTimes(1);
    expect(hoisted.save.mock.calls[0][0]).toMatch(
      /^Rapport_Tresorerie_BELL_MMS_\d{2}-\d{2}-\d{4}\.pdf$/
    );
  });
});

describe('generateReceiptPDF', () => {
  beforeEach(() => {
    vi.mocked(autoTable).mockClear();
    hoisted.save.mockClear();
  });

  it('calcule le cumul encaissé et le solde restant', () => {
    generateReceiptPDF(receipt, sale, 'Marc KAMDEM', 'Lot A-01');

    expect(vi.mocked(autoTable)).toHaveBeenCalledTimes(2);

    const financialTable = tableBody(1);
    expect(normalize(financialTable)).toContain('5 000 000 FCFA');
    expect(normalize(financialTable)).toContain('13 000 000 FCFA');
  });

  it('nomme le reçu avec la référence et le client', () => {
    generateReceiptPDF(receipt, sale, 'Marc KAMDEM', 'Lot A-01');

    expect(hoisted.save).toHaveBeenCalledWith('REC-2026-001_Recu_Marc_KAMDEM.pdf');
  });
});
