import { describe, expect, it } from 'vitest';
import { cn, formatCurrency, formatDate, formatDateTime, formatPhone } from './utils';

const normalizeSpaces = (value: string) => value.replace(/\s/g, ' ');

describe('formatCurrency', () => {
  it('formate un montant en FCFA avec séparateur de milliers', () => {
    expect(normalizeSpaces(formatCurrency(250000))).toBe('250 000 FCFA');
    expect(normalizeSpaces(formatCurrency(18000000))).toBe('18 000 000 FCFA');
  });

  it('retourne 0 FCFA pour une valeur absente ou invalide', () => {
    expect(formatCurrency(null)).toBe('0 FCFA');
    expect(formatCurrency(undefined)).toBe('0 FCFA');
    expect(formatCurrency(Number.NaN)).toBe('0 FCFA');
  });
});

describe('formatDate', () => {
  it('formate une date au format camerounais', () => {
    expect(formatDate('2026-11-08T12:00:00Z')).toBe('08/11/2026');
  });

  it('retourne un tiret pour une valeur absente', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('')).toBe('-');
  });
});

describe('formatDateTime', () => {
  it('ajoute l’heure et remplace les deux-points par h', () => {
    expect(formatDateTime('2026-11-08T19:00:00')).toBe('08/11/2026 19h00');
  });
});

describe('formatPhone', () => {
  it('met en forme un numéro camerounais complet', () => {
    expect(formatPhone('+237 699 00 11 22')).toBe('+237 6 99 00 11 22');
  });

  it('laisse intact un numéro non normalisable', () => {
    expect(formatPhone('699001122')).toBe('699001122');
    expect(formatPhone(null)).toBe('-');
  });
});

describe('cn', () => {
  it('résout les classes Tailwind conflictuelles en gardant la dernière', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
