const { normalizeGoalSecondaryMetric, resolveGoalMetricSelections } = require('../goalConfig');

describe('goalConfig', () => {
  it('resolves primary and secondary business metrics from goal config', () => {
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

  it('drops secondary metrics that match the primary metric', () => {
    expect(normalizeGoalSecondaryMetric('revenue', 'revenue')).toBeNull();
  });
});
