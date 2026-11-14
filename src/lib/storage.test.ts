import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  getStoredData,
  INITIAL_CLIENTS,
  INITIAL_PLOTS,
  INITIAL_SALES,
  initLocalDatabase,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from './storage';
import type { AuditLogEntry } from '../types/auth.types';

vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

const buildAuditEntry = (index: number): AuditLogEntry => ({
  id: `old-${index}`,
  user_id: null,
  user_email: null,
  action: 'CREATE',
  module: 'OLD',
  entity_name: 'entity',
  entity_id: String(index),
  old_values: null,
  new_values: null,
  created_at: '2026-01-01T00:00:00.000Z',
});

describe('getStoredData', () => {
  it('retourne la valeur par défaut quand la clé est absente', () => {
    const fallback = { marker: true };
    expect(getStoredData('missing-key', fallback)).toBe(fallback);
  });

  it('retourne la valeur par défaut quand le JSON est corrompu', () => {
    localStorage.setItem('broken-key', '{not-json');
    expect(getStoredData('broken-key', ['fallback'])).toEqual(['fallback']);
  });
});

describe('setStoredData', () => {
  it('persiste une valeur relisible', () => {
    setStoredData('roundtrip', { amount: 250000 });
    expect(getStoredData('roundtrip', null)).toEqual({ amount: 250000 });
  });
});

describe('initLocalDatabase', () => {
  it('amorce les données de démonstration', () => {
    initLocalDatabase();

    expect(getStoredData(STORAGE_KEYS.SETTINGS, null)).toMatchObject({
      company_name: DEFAULT_SETTINGS.company_name,
    });
    expect(getStoredData(STORAGE_KEYS.CLIENTS, [])).toHaveLength(INITIAL_CLIENTS.length);
    expect(getStoredData(STORAGE_KEYS.PLOTS, [])).toHaveLength(INITIAL_PLOTS.length);
    expect(getStoredData(STORAGE_KEYS.SALES, [])).toHaveLength(INITIAL_SALES.length);
    expect(getStoredData<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, [])).toHaveLength(1);
  });

  it('ne réécrase pas les données existantes', () => {
    initLocalDatabase();
    setStoredData(STORAGE_KEYS.SETTINGS, {
      ...DEFAULT_SETTINGS,
      company_name: 'SOCIÉTÉ MODIFIÉE',
    });

    initLocalDatabase();

    expect(getStoredData(STORAGE_KEYS.SETTINGS, null)).toMatchObject({
      company_name: 'SOCIÉTÉ MODIFIÉE',
    });
  });
});

describe('logAuditEvent', () => {
  it('insère le nouvel événement en tête', () => {
    logAuditEvent({
      user_id: 'user-1',
      user_email: 'dg@bell-mms.cm',
      action: 'LOGIN',
      module: 'AUTH',
      entity_name: 'session',
      entity_id: 'user-1',
      old_values: null,
      new_values: { mode: 'test' },
    });

    const logs = getStoredData<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, []);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ module: 'AUTH', action: 'LOGIN' });
    expect(logs[0].id).toMatch(/^log-/);
    expect(logs[0].created_at).toBeTruthy();
  });

  it('conserve l’ordre antéchronologique et plafonne à 1000 entrées', () => {
    const existing = Array.from({ length: 1000 }, (_, index) => buildAuditEntry(index));
    setStoredData(STORAGE_KEYS.AUDIT_LOGS, existing);

    logAuditEvent({
      user_id: null,
      user_email: null,
      action: 'UPDATE',
      module: 'CAP_TEST',
      entity_name: 'entity',
      entity_id: 'new',
      old_values: null,
      new_values: null,
    });

    const logs = getStoredData<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS, []);
    expect(logs).toHaveLength(1000);
    expect(logs[0].module).toBe('CAP_TEST');
    expect(logs[1].id).toBe('old-0');
    expect(logs[logs.length - 1].id).toBe('old-998');
  });
});
