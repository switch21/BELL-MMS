import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Receipt, Sale } from '../types/sales.types';
import { FinancialAccount, FinancialTransaction } from '../types/finance.types';
import { formatCurrencyPdf, formatDate } from './utils';

const EXECUTIVE_GREEN: [number, number, number] = [22, 75, 58];
const EMERALD: [number, number, number] = [39, 129, 94];
const MUTED: [number, number, number] = [100, 116, 139];
const INK: [number, number, number] = [30, 41, 59];

const APP_NAME = 'BELL MULTI-MANAGEMENT SYSTEM';
const COMPANY_NAME = 'BELL ENTERPRISE SARL';
const REGISTRY_LINE = 'Douala, Cameroun | RCCM: RC/DLA/2026/B/1234 | NIU: M112612345678X';

const LOGO_X = 14;
const LOGO_SIZE = 16;
// Gouttière de 6 mm entre le logo et le bloc de texte.
const TEXT_X = LOGO_X + LOGO_SIZE + 6;
const FOOTER_Y = 287;

function drawLetterhead(doc: jsPDF, activityLine: string) {
  doc.setFillColor(...EXECUTIVE_GREEN);
  doc.rect(0, 0, 210, 2.5, 'F');
  doc.rect(LOGO_X, 8, LOGO_SIZE, LOGO_SIZE, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BE', LOGO_X + LOGO_SIZE / 2, 18, { align: 'center' });

  doc.setTextColor(...EXECUTIVE_GREEN);
  doc.setFontSize(16);
  doc.text(COMPANY_NAME, TEXT_X, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(activityLine, TEXT_X, 21.5);
  doc.text(REGISTRY_LINE, TEXT_X, 26);

  doc.setDrawColor(...EXECUTIVE_GREEN);
  doc.setLineWidth(0.4);
  doc.line(LOGO_X, 30, 196, 30);
}

function drawApplicationFooter(doc: jsPDF) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(APP_NAME, 105, FOOTER_Y, { align: 'center' });
}

export function generateReceiptPDF(receipt: Receipt, sale: Sale, clientName: string, plotInfo: string) {
  const doc = new jsPDF();

  drawLetterhead(doc, 'Aménagement Foncier & Promotion Immobilière');

  // Titre du reçu
  doc.setTextColor(...EXECUTIVE_GREEN);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('REÇU DE PAIEMENT', 14, 45);

  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`RÉFÉRENCE : ${receipt.reference}`, 14, 52);
  doc.text(`DATE D'ÉMISSION : ${formatDate(receipt.payment_date)}`, 14, 58);

  // Bloc Client & Parcelle
  autoTable(doc, {
    startY: 65,
    head: [["BÉNÉFICIAIRE / CLIENT", "DÉSIGNATION DE L'ACQUISITION"]],
    body: [
      [
        `Nom / Raison Sociale : ${clientName}\nMode de règlement : ${receipt.payment_method.toUpperCase()}\nRéf. Transaction : ${receipt.transaction_ref || 'Versement Guichet/Caisse'}`,
        `Dossier Vente : ${sale.reference}\nParcelle concernée : ${plotInfo}\nType de vente : ${sale.sale_type === 'comptant' ? 'Vente au comptant' : 'Vente à tempérament (échelonnée)'}`,
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: EMERALD, textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
  });

  // Tableau Financier
  const currentY = (doc as any).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: currentY,
    head: [["LIBELLÉ DU RÈGLEMENT", "MONTANT ENCAISSÉ"]],
    body: [
      ["Montant du versement constaté ce jour", formatCurrencyPdf(receipt.amount)],
      ["Prix total convenu de la parcelle", formatCurrencyPdf(sale.final_price)],
      ["Cumul des paiements perçus à ce jour", formatCurrencyPdf(sale.final_price - sale.remaining_balance)],
      ["Solde restant à régler par l'acquéreur", formatCurrencyPdf(sale.remaining_balance)],
    ],
    theme: 'striped',
    headStyles: { fillColor: EXECUTIVE_GREEN, textColor: [255, 255, 255] },
    styles: { fontSize: 10, cellPadding: 3.5 },
  });

  // Mentions Légales & Signature
  const footerY = (doc as any).lastAutoTable.finalY + 16;

  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'AVERTISSEMENT : Le présent reçu constate uniquement le paiement effectif des fonds susmentionnés.',
    14,
    footerY
  );
  doc.text(
    'Il est délivré sous seing privé et ne saurait se substituer à un acte notarié de mutation ou titre foncier officiel.',
    14,
    footerY + 5
  );

  // Cadres Signatures
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);

  doc.text("Signature de l'Acquéreur", 30, footerY + 22);
  doc.text('Pour BELL ENTERPRISE — Caissier / DG', 130, footerY + 22);

  doc.setDrawColor(200, 200, 200);
  doc.rect(20, footerY + 26, 60, 22);
  doc.rect(120, footerY + 26, 70, 22);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Reçu par : ' + (receipt.received_by_name || 'Direction Financière'), 125, footerY + 34);

  drawApplicationFooter(doc);

  // Téléchargement du fichier
  doc.save(`${receipt.reference}_Recu_${clientName.replace(/\s+/g, '_')}.pdf`);
}

export interface FinancialReportData {
  accounts: FinancialAccount[];
  transactions: FinancialTransaction[];
  totalCash: number;
  totalBank: number;
  totalTreasury: number;
  totalReceivables: number;
  totalPayables: number;
  totalGrossMargin: number;
  generatedByName: string;
  periodLabel: string;
}

export function generateFinancialReportPDF(data: FinancialReportData) {
  const doc = new jsPDF();

  drawLetterhead(doc, 'Direction Financière & Trésorerie');

  // Titre du Rapport
  doc.setTextColor(...EXECUTIVE_GREEN);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('RAPPORT CONSOLIDÉ DE TRÉSORERIE & SITUATION FINANCIÈRE', 14, 43);

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text(`Période analysée : ${data.periodLabel}`, 14, 49);
  doc.text(`Édité le : ${formatDate(new Date().toISOString())} par ${data.generatedByName}`, 14, 54);

  // Tableau 1 : Synthèse Globale
  autoTable(doc, {
    startY: 60,
    head: [["INDICATEUR CLÉ", "MONTANT (FCFA)", "OBSERVATIONS"]],
    body: [
      ["Trésorerie Totale Disponible", formatCurrencyPdf(data.totalTreasury), "Disponibilités nettes caisses + banques"],
      ["Dont Solde Caisses Physiques", formatCurrencyPdf(data.totalCash), "Liquidités guichets Douala & Chantiers"],
      ["Dont Solde Comptes Bancaires", formatCurrencyPdf(data.totalBank), "UBA Cameroun & BICEC Bonanjo"],
      ["Créances Clients à Recouvrer", formatCurrencyPdf(data.totalReceivables), "Échéances restantes ventes de parcelles"],
      ["Dettes / Reversements Tiers", formatCurrencyPdf(data.totalPayables), "Quotes-parts dues aux tiers propriétaires"],
      ["Marge Brute BELL Constatée", formatCurrencyPdf(data.totalGrossMargin), "Commissions 12% tiers + 3% financements"],
    ],
    theme: 'grid',
    headStyles: { fillColor: EMERALD, textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 3.5 },
  });

  // Tableau 2 : Détail des Comptes
  const accountsY = (doc as any).lastAutoTable.finalY + 8;
  doc.setTextColor(...EXECUTIVE_GREEN);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DÉTAIL DES COMPTES ET CAISSES EN SERVICE', 14, accountsY);

  const accountRows = data.accounts.map(acc => [
    acc.code,
    acc.name,
    acc.account_type.toUpperCase(),
    acc.bank_name || 'Caisse physique',
    acc.account_number || 'N/A',
    formatCurrencyPdf(acc.current_balance),
  ]);

  autoTable(doc, {
    startY: accountsY + 3,
    head: [["CODE", "INTITULÉ DU COMPTE", "NATURE", "ÉTABLISSEMENT", "NUMÉRO", "SOLDE ACTUEL"]],
    body: accountRows,
    theme: 'striped',
    headStyles: { fillColor: EXECUTIVE_GREEN, textColor: [255, 255, 255] },
    styles: { fontSize: 8, cellPadding: 3 },
  });

  // Tableau 3 : Derniers Mouvements de Trésorerie
  const trxY = (doc as any).lastAutoTable.finalY + 8;
  doc.setTextColor(...EXECUTIVE_GREEN);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('JOURNAL RÉCENT DES MOUVEMENTS', 14, trxY);

  const trxRows = data.transactions.slice(0, 10).map(trx => [
    trx.reference,
    formatDate(trx.transaction_date),
    trx.account_name || 'N/A',
    trx.transaction_type.toUpperCase(),
    trx.beneficiary_or_payer || 'N/A',
    formatCurrencyPdf(trx.amount),
    formatCurrencyPdf(trx.balance_after),
  ]);

  autoTable(doc, {
    startY: trxY + 3,
    head: [["RÉFÉRENCE", "DATE", "COMPTE", "TYPE", "TIERS / BÉNÉFICIAIRE", "MONTANT", "SOLDE APRÈS"]],
    body: trxRows,
    theme: 'grid',
    headStyles: { fillColor: EMERALD, textColor: [255, 255, 255] },
    styles: { fontSize: 7.5, cellPadding: 2.5 },
  });

  // Mentions Légales & Signature
  const footerY = (doc as any).lastAutoTable.finalY + 12;

  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'italic');
  doc.text('Document officiel d\'exploitation interne édité sous BELL-MMS. Certifié conforme aux écritures de caisse.', 14, footerY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text('Pour visa & contrôle — Responsable Financier', 25, footerY + 12);
  doc.text('Approbation — Direction Générale', 135, footerY + 12);

  doc.setDrawColor(200, 200, 200);
  doc.rect(20, footerY + 16, 70, 20);
  doc.rect(130, footerY + 16, 65, 20);

  drawApplicationFooter(doc);

  doc.save(`Rapport_Tresorerie_BELL_MMS_${formatDate(new Date().toISOString()).replace(/\//g, '-')}.pdf`);
}
