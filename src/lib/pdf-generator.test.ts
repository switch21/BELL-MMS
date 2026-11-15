import { beforeEach, describe, expect, it, vi } from 'vitest';
import autoTable from 'jspdf-autotable';
import { generateFinancialReportPDF, generateReceiptPDF, type FinancialReportData } from './pdf-generator';
import type { FinancialAccount, FinancialTransaction } from '../types/finance.types';
import type { Receipt, Sale } from '../types/sales.types';

const hoisted = vi.hoisted(() => ({
  save: vi.fn(),
  log: [] as Array<[string, ...unknown[]]>,
}));

vi.mock('jspdf', () => ({
  default: class MockJsPDF {
    lastAutoTable = { finalY: 100 };

    private record(name: string) {
      return (...args: unknown[]) => {
        hoisted.log.push([name, ...args]);
      };
    }

    setFillColor = this.record('setFillColor');
    rect = this.record('rect');
    setTextColor = this.record('setTextColor');
    setFontSize = this.record('setFontSize');
    setFont = this.record('setFont');
    setDrawColor = this.record('setDrawColor');
    setLineWidth = this.record('setLineWidth');
    line = this.record('line');
    text = this.record('text');
    save = hoisted.save;
  },
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

const normalize = (value: unknown) => JSON.stringify(value).replace(/\s/g, ' ');

const tableBody = (callIndex: number): string[][] =>
  (vi.mocked(autoTable).mock.calls[callIndex][1] as unknown as { body: string[][] }).body;

/** Séquence de dessin reconstruite depuis le journal : chaque texte porte la taille de police active. */
const drawnTexts = () => {
  const drawn: Array<{ value: string; x: number; y: number; size: number | null }> = [];
  let size: number | null = null;

  for (const entry of hoisted.log) {
    if (entry[0] === 'setFontSize') {
      size = entry[1] as number;
      continue;
    }
    if (entry[0] === 'text') {
      drawn.push({ value: entry[1] as string, x: entry[2] as number, y: entry[3] as number, size });
    }
  }

  return drawn;
};

const fullWidthRects = () =>
  hoisted.log
    .filter((entry) => entry[0] === 'rect')
    .map((entry) => ({ x: entry[1] as number, y: entry[2] as number, w: entry[3] as number, h: entry[4] as number }))
    .filter((rect) => rect.w >= 210);

/** Espaces insécables et variantes fines : absents du WinAnsiEncoding des polices standard de jsPDF. */
const PDF_UNSAFE_SPACES = /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/;

const allPdfStrings = (): string[] => {
  const fromTables = vi.mocked(autoTable).mock.calls.flatMap((call) => {
    const options = call[1] as unknown as { head?: string[][]; body?: string[][] };
    return [...(options.head ?? []), ...(options.body ?? [])].flat();
  });
  return [...drawnTexts().map((entry) => entry.value), ...fromTables];
};

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
    hoisted.log.length = 0;
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
    hoisted.log.length = 0;
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

describe('Mise en page des documents PDF (reçu et rapport de trésorerie)', () => {
  const renderers: Array<{ label: string; run: () => void; amount: string }> = [
    { label: 'reçu', run: () => generateReceiptPDF(receipt, sale, 'Marc KAMDEM', 'Lot A-01'), amount: '18 000 000 FCFA' },
    { label: 'rapport de trésorerie', run: () => generateFinancialReportPDF(reportData), amount: '33 000 000 FCFA' },
  ];

  beforeEach(() => {
    vi.mocked(autoTable).mockClear();
    hoisted.save.mockClear();
    hoisted.log.length = 0;
  });

  it.each(renderers)('n’utilise que des espaces ASCII dans les textes du $label', ({ run, amount }) => {
    run();

    // Comparaison brute, sans normalize() : un séparateur U+202F ferait échouer toContain.
    const raw = allPdfStrings().join(' ');
    expect(raw.match(PDF_UNSAFE_SPACES)).toBeNull();
    expect(raw).toContain(amount);
  });

  it.each(renderers)('réserve le nom de l’application au pied de page, en petit corps, pour le $label', ({ run }) => {
    run();

    const appLines = drawnTexts().filter((entry) => entry.value === 'BELL MULTI-MANAGEMENT SYSTEM');
    expect(appLines).toHaveLength(1);
    expect(appLines[0].y).toBeGreaterThanOrEqual(280);
    expect(appLines[0].size).toBeLessThanOrEqual(8);
  });

  it.each(renderers)('place le nom de la société à l’emplacement du nom de l’application, après une gouttière, pour le $label', ({ run }) => {
    run();

    const companyLines = drawnTexts().filter((entry) => entry.value === 'BELL ENTERPRISE SARL');
    expect(companyLines).toHaveLength(1);
    expect(companyLines[0].y).toBeLessThanOrEqual(20);
    expect(companyLines[0].size).toBeGreaterThanOrEqual(14);
    // Le logo occupe 14 → 30 mm : le texte ne peut pas démarrer avant 34 mm.
    expect(companyLines[0].x).toBeGreaterThanOrEqual(34);
  });

  it.each(renderers)('ne peint plus de bandeau vert pleine page au-dessus de 3 mm pour le $label', ({ run }) => {
    run();

    const bands = fullWidthRects();
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      expect(band.h).toBeLessThanOrEqual(3);
    }
  });
});
