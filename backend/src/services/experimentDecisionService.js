const analyticsService = require('./analytics');
const { getFunnelMetrics } = require('../models/analytics');
const { getTestById } = require('../models/test');

function normalizeGoalMetric(rawValue) {
  const value = String(rawValue || 'conversion_rate')
    .trim()
    .toLowerCase();
  return value || 'conversion_rate';
}

function getMetricValue(variant = {}, metric = 'conversion_rate') {
  switch (normalizeGoalMetric(metric)) {
    case 'revenue':
      return Number(variant.revenue) || 0;
    case 'aov':
    case 'average_order_value':
      return Number(variant.avgOrderValue) || 0;
    case 'revenue_per_visitor':
      return Number(variant.visitors) > 0
        ? (Number(variant.revenue) || 0) / Number(variant.visitors)
        : 0;
    case 'conversions':
      return Number(variant.conversions) || 0;
    case 'conversion_rate':
    default:
      return Number(variant.conversionRate) || 0;
  }
}

function buildGuardrailMetricSummary(test = {}, analytics = {}) {
  const variants = Array.isArray(analytics.variants) ? analytics.variants : [];
  const goal = test?.goal && typeof test.goal === 'object' ? test.goal : {};
  const guardrails = Array.isArray(goal.guardrails)
    ? goal.guardrails
    : Array.isArray(goal.guardrail_metrics)
      ? goal.guardrail_metrics
      : [];
  const control = variants[0] || null;
  if (!control || guardrails.length === 0) {
    return {
      configured: guardrails.length,
      status: guardrails.length > 0 ? 'insufficient_data' : 'not_configured',
      metrics: [],
    };
  }

  const metrics = guardrails.map((guardrail, index) => {
    const metric = normalizeGoalMetric(guardrail.metric || guardrail.type || 'conversion_rate');
    const minRelativeLift = Number(guardrail.min_relative_lift ?? guardrail.minRelativeLift ?? 0);
    const threshold = Number.isFinite(minRelativeLift) ? minRelativeLift : 0;
    const controlValue = getMetricValue(control, metric);
    const evaluated = variants.slice(1).map(variant => {
      const value = getMetricValue(variant, metric);
      const relativeLift = controlValue > 0 ? ((value - controlValue) / controlValue) * 100 : 0;
      return {
        variantId: variant.id,
        variantName: variant.name,
        value,
        relativeLift: Math.round(relativeLift * 100) / 100,
        breached: relativeLift < threshold,
      };
    });
    return {
      id: String(guardrail.id || guardrail.key || `guardrail-${index + 1}`),
      metric,
      threshold,
      status: evaluated.some(item => item.breached) ? 'breached' : 'clear',
      variants: evaluated,
    };
  });

  return {
    configured: metrics.length,
    status: metrics.some(metric => metric.status === 'breached') ? 'breached' : 'clear',
    metrics,
  };
}

function buildOrderedFunnelScaffold(funnel = {}) {
  const steps = Array.isArray(funnel.steps) ? funnel.steps : [];
  return {
    mode: 'ordered_sequence',
    status: 'scaffolded',
    description:
      'Current funnel counts remain distinct-user step counts. Ordered funnel sequencing is prepared for user_id + created_at based path SQL.',
    requiredFields: ['events.user_id', 'events.created_at', 'test_assignments.assigned_at'],
    steps: steps.map((step, index) => ({
      ...step,
      order: index + 1,
    })),
  };
}

function buildStatisticsReadiness(analytics = {}) {
  const variants = Array.isArray(analytics.variants) ? analytics.variants : [];
  const totalVisitors = variants.reduce((sum, variant) => sum + (Number(variant.visitors) || 0), 0);
  const hasPreExperimentCovariates = variants.some(
    variant => variant?.preExperimentMetric !== undefined
  );
  return {
    frequentist: { available: true, method: analytics.significance?.method || 'auto' },
    bayesian: {
      available: Boolean(analytics.significance?.bayesian),
      status: analytics.significance?.bayesian ? 'enabled' : 'available_on_goal',
    },
    cuped: {
      available: false,
      status: hasPreExperimentCovariates
        ? 'ready_for_covariates'
        : 'needs_pre_experiment_covariates',
      requiredFields: ['user_id', 'pre_experiment_metric', 'experiment_metric'],
    },
    srm: analytics.srm || { detected: false },
    sampleSize: {
      totalVisitors,
      status: totalVisitors >= 500 ? 'healthy' : totalVisitors >= 100 ? 'low' : 'insufficient',
    },
  };
}

async function getExperimentDecisionOverview(testId, shopDomain, options = {}) {
  const [test, analytics] = await Promise.all([
    getTestById(testId, shopDomain),
    analyticsService.getTestAnalytics(testId, shopDomain, options),
  ]);
  const funnel = await getFunnelMetrics(testId, shopDomain, {
    ...options,
    funnel_steps: test?.goal?.funnel_steps,
  }).catch(() => null);

  return {
    testId,
    shopDomain,
    primaryMetric: normalizeGoalMetric(test?.goal?.metric),
    analysisMethod: analytics.analysisMethod || 'frequentist',
    statistics: buildStatisticsReadiness(analytics),
    guardrails: buildGuardrailMetricSummary(test, analytics),
    funnel: funnel
      ? {
          ...funnel,
          orderedScaffold: buildOrderedFunnelScaffold(funnel),
        }
      : null,
    recommendations: [
      analytics.srm?.detected ? 'Investigate sample ratio mismatch before trusting results.' : null,
      analytics.summary?.totalVisitors < 500
        ? 'Collect more traffic before acting on small lifts.'
        : null,
    ].filter(Boolean),
  };
}

module.exports = {
  buildGuardrailMetricSummary,
  buildOrderedFunnelScaffold,
  buildStatisticsReadiness,
  getExperimentDecisionOverview,
};
