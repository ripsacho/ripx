import {
  buildGoalMetricTooltip,
  formatGoalBusinessMetricValue,
  getGoalBusinessMetricValue,
  getGoalMetricLabel,
  normalizeGoalPrimaryMetric,
  normalizeGoalSecondaryMetric,
  resolveGoalMetricSelections,
} from '../goalMetricConfig';

describe('goalMetricConfig', () => {
  it('normalizes primary metrics with fallback', () => {
    expect(normalizeGoalPrimaryMetric('revenue')).toBe('revenue');
    expect(normalizeGoalPrimaryMetric('unknown', 'conversion_rate')).toBe('conversion_rate');
  });

  it('keeps secondary metrics only when different from primary', () => {
    expect(normalizeGoalSecondaryMetric('revenue', 'conversion_rate')).toBe('conversion_rate');
    expect(normalizeGoalSecondaryMetric('revenue', 'revenue')).toBeNull();
    expect(normalizeGoalSecondaryMetric('revenue', '')).toBeNull();
  });

  it('maps metric labels for review chips', () => {
    expect(getGoalMetricLabel('revenue_per_visitor')).toBe('RPV');
    expect(getGoalMetricLabel('conversion_rate')).toBe('Conversion');
  });

  it('formats business metric values for reporting', () => {
    expect(formatGoalBusinessMetricValue(12.5, 'conversion_rate')).toBe('12.50%');
    expect(
      getGoalBusinessMetricValue(
        { visitors: 100, revenue: 250, conversionRate: 5 },
        'revenue_per_visitor'
      )
    ).toBe(2.5);
  });

  it('resolves primary and secondary selections from goal config', () => {
    expect(
      resolveGoalMetricSelections({
        metric: 'revenue',
        secondary_metric: 'conversion_rate',
      })
    ).toEqual({
      primaryMetric: 'revenue',
      secondaryMetric: 'conversion_rate',
    });
  });

  it('builds tooltip copy for compact metric chips', () => {
    expect(
      buildGoalMetricTooltip({
        desc: 'Total sales',
        useCase: 'Best for price tests.',
        interpretation: 'Winner is strongest revenue.',
        requiredData: 'Purchase value events',
      })
    ).toContain('Total sales');
  });
});
