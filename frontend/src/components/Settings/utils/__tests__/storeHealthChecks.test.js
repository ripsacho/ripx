import {
  filterVisibleHealthChecks,
  getHealthCheckStatus,
  getHealthCheckTitle,
  getHealthSummaryHint,
  partitionHealthChecks,
  resolveSettingsPresetKey,
  shouldAutoOpenHealthChecks,
  shouldExpandHealthChecksOnUpdate,
  sortHealthChecks,
  summarizeHealthChecks,
} from '../storeHealthChecks';
import { DEFAULT_SETTINGS, SETTINGS_PRESETS } from '../../config/settingsConstants';

const sampleChecks = [
  { key: 'script_detected', ok: true, required: true, message: 'Script ok' },
  { key: 'checkout_diag', ok: false, required: true, advisory: false, message: 'Diag failed' },
  {
    key: 'running_price_test',
    ok: false,
    required: false,
    advisory: true,
    message: 'No running test',
  },
];

describe('storeHealthChecks', () => {
  it('maps known check keys to merchant-friendly titles', () => {
    expect(getHealthCheckTitle({ key: 'script_detected' })).toBe('Storefront script');
    expect(getHealthCheckTitle({ key: 'custom_check_key' })).toBe('Custom Check Key');
  });

  it('classifies passing, advisory, and blocking statuses', () => {
    expect(getHealthCheckStatus({ ok: true }).label).toBe('Passing');
    expect(getHealthCheckStatus({ ok: false, advisory: true }).label).toBe('Advisory');
    expect(getHealthCheckStatus({ ok: false, required: true }).label).toBe('Blocking');
  });

  it('summarizes check counts', () => {
    expect(summarizeHealthChecks(sampleChecks)).toEqual({
      passing: 1,
      advisory: 1,
      blocking: 1,
      total: 3,
    });
  });

  it('builds summary hints from stats', () => {
    expect(getHealthSummaryHint({ blocking: 2, advisory: 0 })).toMatch(/2 blocking issues/);
    expect(getHealthSummaryHint({ blocking: 0, advisory: 1 })).toMatch(/1 advisory item/);
    expect(getHealthSummaryHint({ blocking: 0, advisory: 0 })).toMatch(/All required checks/);
  });

  it('sorts failing checks before advisory and passing', () => {
    const sorted = sortHealthChecks(sampleChecks);
    expect(sorted[0].key).toBe('checkout_diag');
    expect(sorted[sorted.length - 1].key).toBe('script_detected');
  });

  it('partitions required and optional checks', () => {
    const { required, optional } = partitionHealthChecks(sampleChecks);
    expect(required.map(item => item.key)).toEqual(['checkout_diag', 'script_detected']);
    expect(optional.map(item => item.key)).toEqual(['running_price_test']);
  });

  it('hides passing checks unless showPassing is enabled', () => {
    const { required } = partitionHealthChecks(sampleChecks);
    expect(filterVisibleHealthChecks(required, false).map(item => item.key)).toEqual([
      'checkout_diag',
    ]);
    expect(filterVisibleHealthChecks(required, true)).toHaveLength(2);
  });

  it('auto-opens when blocking checks exist', () => {
    expect(shouldAutoOpenHealthChecks(sampleChecks)).toBe(true);
    expect(shouldAutoOpenHealthChecks([{ ok: true, required: true }])).toBe(false);
  });

  it('expands when blocking count increases after async refresh', () => {
    expect(shouldExpandHealthChecksOnUpdate(0, 1)).toBe(true);
    expect(shouldExpandHealthChecksOnUpdate(1, 2)).toBe(true);
    expect(shouldExpandHealthChecksOnUpdate(1, 1)).toBe(false);
    expect(shouldExpandHealthChecksOnUpdate(2, 1)).toBe(false);
    expect(shouldExpandHealthChecksOnUpdate(0, 0)).toBe(false);
  });

  it('resolves preset key from settings values', () => {
    expect(resolveSettingsPresetKey(DEFAULT_SETTINGS, SETTINGS_PRESETS)).toBe('recommended');
    expect(
      resolveSettingsPresetKey(
        { minSampleSize: 999, confidenceLevel: 0.5, autoStopEnabled: false },
        SETTINGS_PRESETS
      )
    ).toBeNull();
  });
});
