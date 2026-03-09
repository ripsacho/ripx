/**
 * Status constants – unit tests
 *
 * Ensures frontend TEST_STATUS and TEST_TYPES align with API/backend usage
 * (backend is canonical; frontend uses same string values for status/type).
 */

import {
  TEST_STATUS,
  TEST_STATUS_LABELS,
  TEST_STATUS_OPTIONS,
  TEST_TYPES,
  STANDALONE_TEST_TYPE_IDS,
} from '../status.js';

describe('TEST_STATUS', () => {
  it('uses stopped not paused (matches backend and API)', () => {
    expect(TEST_STATUS.STOPPED).toBe('stopped');
    expect(TEST_STATUS).not.toHaveProperty('PAUSED');
  });

  it('includes API-used values: draft, running, stopped, completed', () => {
    expect(TEST_STATUS.DRAFT).toBe('draft');
    expect(TEST_STATUS.RUNNING).toBe('running');
    expect(TEST_STATUS.COMPLETED).toBe('completed');
  });

  it('has a label for each status', () => {
    expect(TEST_STATUS_LABELS[TEST_STATUS.DRAFT]).toBe('Draft');
    expect(TEST_STATUS_LABELS[TEST_STATUS.STOPPED]).toBe('Stopped');
  });

  it('TEST_STATUS_OPTIONS includes all statuses', () => {
    const values = TEST_STATUS_OPTIONS.map(o => o.value);
    expect(values).toContain(TEST_STATUS.DRAFT);
    expect(values).toContain(TEST_STATUS.STOPPED);
    expect(values).toContain(TEST_STATUS.ALL);
  });
});

describe('TEST_TYPES', () => {
  it('includes price (API canonical) and pricing (UI alias)', () => {
    expect(TEST_TYPES.PRICE).toBe('price');
    expect(TEST_TYPES.PRICING).toBe('pricing');
  });

  it('STANDALONE_TEST_TYPE_IDS is a subset of test types', () => {
    STANDALONE_TEST_TYPE_IDS.forEach(id => {
      expect(Object.values(TEST_TYPES)).toContain(id);
    });
    expect(STANDALONE_TEST_TYPE_IDS).toContain('onsite-edit');
    expect(STANDALONE_TEST_TYPE_IDS).toContain('split-url');
  });
});
