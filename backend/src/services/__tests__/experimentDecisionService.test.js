jest.mock('../analytics', () => ({}));
jest.mock('../../models/analytics', () => ({
  getFunnelMetrics: jest.fn(),
}));
jest.mock('../../models/test', () => ({
  getTestById: jest.fn(),
}));

const { buildGuardrailMetricSummary } = require('../experimentDecisionService');

describe('experimentDecisionService guardrail statistics', () => {
  it('adds inferential metadata to rate-like guardrail rows', () => {
    const summary = buildGuardrailMetricSummary(
      {
        goal: {
          guardrails: [
            {
              id: 'conversion-health',
              metric: 'conversion_rate',
              label: 'Conversion Health',
              direction: 'increase',
              min_relative_lift: -10,
            },
          ],
        },
      },
      {
        variants: [
          {
            id: 'control',
            name: 'Control',
            visitors: 1000,
            conversions: 100,
            conversionRate: 10,
          },
          {
            id: 'variant',
            name: 'Variant',
            visitors: 1000,
            conversions: 80,
            conversionRate: 8,
          },
        ],
      }
    );

    const evaluated = summary.metrics[0].variants[0];
    expect(evaluated.relativeLift).toBe(-20);
    expect(evaluated.breached).toBe(true);
    expect(evaluated.method).toBe('two_proportion_z_test');
    expect(evaluated.pValue).toBeGreaterThanOrEqual(0);
    expect(evaluated.pValue).toBeLessThanOrEqual(1);
    expect(evaluated.confidenceInterval.relativeLow).toBeLessThan(
      evaluated.confidenceInterval.relativeHigh
    );
  });
});
