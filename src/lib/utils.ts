import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formate un montant numérique en FCFA (XAF)
 * Ex: formatCurrency(250000) => "250 000 FCFA"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0 FCFA';
  }
  return new Intl.NumberFormat('fr-CM', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(amount) + ' FCFA';
}

/**
 * Formate une date au format camerounais / français
 * Ex: formatDate("2026-11-08") => "08/11/2026"
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('fr-CM', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateString;
  }
}

/**
 * Formate une date avec heure
 * Ex: formatDateTime("2026-11-08T19:00:00") => "08/11/2026 à 19:00"
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('fr-CM', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d).replace(':', 'h');
  } catch {
    return dateString;
  }
}

/**
 * Formate un numéro de téléphone camerounais (+237)
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('237') && cleaned.length === 12) {
    return `+237 ${cleaned.substring(3, 4)} ${cleaned.substring(4, 6)} ${cleaned.substring(6, 8)} ${cleaned.substring(8, 10)} ${cleaned.substring(10, 12)}`;
  }
  return phone;
}
