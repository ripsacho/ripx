const { buildAnalyticsPortfolioOverview, summarizeTest } = require('../analyticsOverviewService');

describe('analyticsOverviewService', () => {
  it('builds portfolio readiness, risk, and leaderboard data', () => {
    const overview = buildAnalyticsPortfolioOverview([
      {
        id: 'test-1',
        name: 'Homepage hero',
        type: 'content',
        status: 'running',
        variants: [
          { id: 'control', name: 'Control', visitors: 600, conversions: 60, revenue: 600 },
          { id: 'variant', name: 'Variant', visitors: 600, conversions: 90, revenue: 900 },
        ],
        health: { score: 90, healthLevel: 'excellent' },
      },
      {
        id: 'test-2',
        name: 'Shipping promise',
        type: 'shipping',
        status: 'running',
        variants: [
          { id: 'control', name: 'Control', visitors: 100, conversions: 0, revenue: 0 },
          { id: 'variant', name: 'Variant', visitors: 100, conversions: 0, revenue: 0 },
        ],
        health: { score: 45, srm: { detected: true } },
      },
    ]);

    expect(overview.totals.tests).toBe(2);
    expect(overview.totals.visitors).toBe(1400);
    expect(overview.totals.winnerReady).toBe(1);
    expect(overview.totals.srmRisks).toBe(1);
    expect(overview.readiness.needsAttention).toBe(1);
    expect(overview.topTests[0].id).toBe('test-1');
    expect(overview.attentionQueue[0]).toMatchObject({
      id: 'test-2',
      srmDetected: true,
    });
    expect(overview.nextAction.id).toBe('test-2');
  });

  it('does not mark single-variant or weak-lift tests as winner ready', () => {
    expect(
      summarizeTest({
        id: 'single',
        status: 'running',
        variants: [{ id: 'control', visitors: 600, conversions: 90 }],
      }).winnerReady
    ).toBe(false);

    expect(
      summarizeTest({
        id: 'weak-lift',
        status: 'running',
        variants: [
          { id: 'control', visitors: 600, conversions: 100 },
          { id: 'variant', visitors: 600, conversions: 104 },
        ],
      }).winnerReady
    ).toBe(false);
  });

  it('surfaces missing conversions only after meaningful running traffic', () => {
    const summary = summarizeTest({
      id: 'no-conversions',
      status: 'running',
      variants: [
        { id: 'control', visitors: 60, conversions: 0 },
        { id: 'variant', visitors: 60, conversions: 0 },
      ],
    });

    expect(summary.missingConversions).toBe(true);
    expect(summary.attentionReasons).toContain('No conversions yet');
  });
});
