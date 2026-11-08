import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Receipt, Sale } from '../types/sales.types';
import { formatCurrency, formatDate } from './utils';

export function generateReceiptPDF(receipt: Receipt, sale: Sale, clientName: string, plotInfo: string) {
  const doc = new jsPDF();

  // En-tête Entreprise
  doc.setFillColor(22, 75, 58); // #164B3A Executive Green
  doc.rect(0, 0, 210, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('BELL MULTI-MANAGEMENT SYSTEM', 14, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('BELL ENTERPRISE SARL — Aménagement Foncier & Promotion Immobilière', 14, 22);
  doc.text('Douala, Cameroun | RCCM: RC/DLA/2026/B/1234 | NIU: M112612345678X', 14, 28);

  // Titre du reçu
  doc.setTextColor(22, 75, 58);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('REÇU DE PAIEMENT', 14, 48);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`RÉFÉRENCE : ${receipt.reference}`, 14, 55);
  doc.text(`DATE D'ÉMISSION : ${formatDate(receipt.payment_date)}`, 14, 61);

  // Bloc Client & Parcelle
  autoTable(doc, {
    startY: 68,
    head: [["BÉNÉFICIAIRE / CLIENT", "DÉSIGNATION DE L'ACQUISITION"]],
    body: [
      [
        `Nom / Raison Sociale : ${clientName}\nMode de règlement : ${receipt.payment_method.toUpperCase()}\nRéf. Transaction : ${receipt.transaction_ref || 'Versement Guichet/Caisse'}`,
        `Dossier Vente : ${sale.reference}\nParcelle concernée : ${plotInfo}\nType de vente : ${sale.sale_type === 'comptant' ? 'Vente au comptant' : 'Vente à tempérament (échelonnée)'}`,
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [39, 129, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
  });

  // Tableau Financier
  const currentY = (doc as any).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: currentY,
    head: [["LIBELLÉ DU RÈGLEMENT", "MONTANT ENCAISSÉ"]],
    body: [
      ["Montant du versement constaté ce jour", formatCurrency(receipt.amount)],
      ["Prix total convenu de la parcelle", formatCurrency(sale.final_price)],
      ["Cumul des paiements perçus à ce jour", formatCurrency(sale.final_price - sale.remaining_balance)],
      ["Solde restant à régler par l'acquéreur", formatCurrency(sale.remaining_balance)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [22, 75, 58], textColor: [255, 255, 255] },
    styles: { fontSize: 10, cellPadding: 3.5 },
  });

  // Mentions Légales & Signature
  const footerY = (doc as any).lastAutoTable.finalY + 16;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
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
  doc.setTextColor(30, 41, 59);

  doc.text("Signature de l'Acquéreur", 30, footerY + 22);
  doc.text('Pour BELL ENTERPRISE — Caissier / DG', 130, footerY + 22);

  doc.setDrawColor(200, 200, 200);
  doc.rect(20, footerY + 26, 60, 22);
  doc.rect(120, footerY + 26, 70, 22);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Reçu par : ' + (receipt.received_by_name || 'Direction Financière'), 125, footerY + 34);

  // Téléchargement du fichier
  doc.save(`${receipt.reference}_Recu_${clientName.replace(/\s+/g, '_')}.pdf`);
}
