import {
  formatLocalDate,
  getApiErrorMessage,
  getDateRangeParams,
  normalizeFunnelVariantParam,
} from '../funnelViewUtils';

describe('funnelViewUtils', () => {
  it('formats calendar dates without UTC shifting', () => {
    expect(formatLocalDate(new Date(2026, 4, 6, 23, 30))).toBe('2026-05-06');
  });

  it('builds inclusive-start exclusive-end date params in local calendar time', () => {
    expect(getDateRangeParams('7', new Date(2026, 4, 6, 12))).toEqual({
      start_date: '2026-04-29',
      end_date: '2026-05-07',
    });
    expect(getDateRangeParams('all', new Date(2026, 4, 6, 12))).toEqual({});
  });

  it('preserves cleared funnel variant URL state as empty selection', () => {
    expect(normalizeFunnelVariantParam(new URLSearchParams('funnel_variant=variant-a'))).toBe(
      'variant-a'
    );
    expect(normalizeFunnelVariantParam(new URLSearchParams(''))).toBe('');
  });

  it('surfaces API error details and status for support', () => {
    expect(
      getApiErrorMessage({ response: { status: 503, data: { error: 'Rollup unavailable' } } })
    ).toBe('Rollup unavailable (HTTP 503)');
  });
});
