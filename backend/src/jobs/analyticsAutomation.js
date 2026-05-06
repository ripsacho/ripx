const analyticsService = require('../services/analytics');

const AUTOMATION_ANALYTICS_SCOPE = Object.freeze({
  scope: 'global_full_history',
  reason:
    'Automation decisions intentionally use full-test analytics, not dashboard segment filters.',
});

async function getAutomationAnalytics(testId, shopDomain) {
  const analytics = await analyticsService.getTestAnalytics(testId, shopDomain);
  return {
    ...analytics,
    automationScope: AUTOMATION_ANALYTICS_SCOPE,
  };
}

function resolveWinningVariant(analytics = {}) {
  const variants = Array.isArray(analytics.variants) ? analytics.variants : [];
  const sig = analytics.significance || {};
  const preferredId = sig.winnerVariantId ?? sig.bestVariantId;
  if (preferredId !== undefined && preferredId !== null) {
    const match = variants.find(v => String(v.id) === String(preferredId));
    if (match) {
      return match;
    }
  }
  if (sig.winner === 'variantB') {
    return variants[1] || null;
  }
  if (sig.winner === 'variantA') {
    return variants[0] || null;
  }
  return variants[1] || variants[0] || null;
}

module.exports = {
  AUTOMATION_ANALYTICS_SCOPE,
  getAutomationAnalytics,
  resolveWinningVariant,
};
