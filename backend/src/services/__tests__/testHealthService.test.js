const testHealthService = require('../testHealthService');

describe('testHealthService.calculateHealthScore', () => {
  it('flags SRM as high risk and recommends hold/investigate', () => {
    const health = testHealthService.calculateHealthScore({
      status: 'running',
      started_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      variants: [
        { name: 'Control', allocation: 50, visitors: 9000, conversions: 500 },
        { name: 'Variant A', allocation: 50, visitors: 1000, conversions: 80 },
      ],
      significance: { significant: false },
    });

    expect(health.srm?.detected).toBe(true);
    expect(health.riskSignals?.level).toBe('high');
    expect(health.riskSignals?.blockers).toContain('SRM detected');
    expect(health.rolloutRecommendation?.action).toBe('hold_investigate');
  });

  it('recommends controlled canary rollout for healthy significant tests', () => {
    const health = testHealthService.calculateHealthScore({
      status: 'running',
      started_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      variants: [
        { name: 'Control', allocation: 50, visitors: 2500, conversions: 250 },
        { name: 'Variant A', allocation: 50, visitors: 2500, conversions: 300 },
      ],
      significance: { significant: true },
    });

    expect(health.score).toBeGreaterThanOrEqual(85);
    expect(health.riskSignals?.level).toBe('low');
    expect(health.rolloutRecommendation?.action).toBe('canary_rollout');
    expect(health.rolloutRecommendation?.suggestedInitialPercent).toBe(25);
  });
});
