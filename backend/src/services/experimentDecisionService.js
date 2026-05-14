const analyticsService = require('./analytics');
const { getFunnelMetrics } = require('../models/analytics');
const { getTestById } = require('../models/test');
const {
  normalizeGoalMetric,
  parseGoalConfig,
  resolveGoalMetricSelections,
} = require('../utils/goalConfig');
const logger = require('../utils/logger');

function getMetricValue(variant = {}, metric = 'conversion_rate') {
  switch (normalizeGoalMetric(metric)) {
    case 'revenue':
      return Number(variant.revenue) || 0;
    case 'profit':
      return Number(variant.profit) || Number(variant.revenue) || 0;
    case 'aov':
    case 'average_order_value':
      return Number(variant.avgOrderValue) || 0;
    case 'revenue_per_visitor':
      return Number(variant.visitors) > 0
        ? (Number(variant.revenue) || 0) / Number(variant.visitors)
        : 0;
    case 'profit_per_visitor':
      return Number(variant.visitors) > 0
        ? (Number(variant.profit) || Number(variant.revenue) || 0) / Number(variant.visitors)
        : 0;
    case 'conversions':
      return Number(variant.conversions) || 0;
    case 'conversion_rate':
    default:
      return Number(variant.conversionRate) || 0;
  }
}

function getSecondaryMetricValue(variant = {}, guardrail = {}) {
  const eventName = guardrail.event_name || guardrail.eventName;
  if (!eventName) {
    return 0;
  }
  const eventData = variant.secondaryEvents?.[eventName] || {};
  if ((guardrail.aggregation || 'count') === 'sum') {
    return Number(eventData.sum) || 0;
  }
  return Number(eventData.count) || 0;
}

function getRelativeLift(value, controlValue) {
  if (controlValue > 0) {
    return ((value - controlValue) / controlValue) * 100;
  }
  if (value > 0) {
    return 100;
  }
  return 0;
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function buildProportionComparison(
  controlSuccesses,
  controlVisitors,
  variantSuccesses,
  variantVisitors
) {
  const controlN = Number(controlVisitors) || 0;
  const variantN = Number(variantVisitors) || 0;
  const controlX = Number(controlSuccesses) || 0;
  const variantX = Number(variantSuccesses) || 0;
  if (controlN <= 0 || variantN <= 0) {
    return null;
  }
  const controlRate = controlX / controlN;
  const variantRate = variantX / variantN;
  const pooled = (controlX + variantX) / (controlN + variantN);
  const pooledSe = Math.sqrt(pooled * (1 - pooled) * (1 / controlN + 1 / variantN));
  const unpooledSe = Math.sqrt(
    (controlRate * (1 - controlRate)) / controlN + (variantRate * (1 - variantRate)) / variantN
  );
  const diff = variantRate - controlRate;
  const zScore = pooledSe > 0 ? diff / pooledSe : 0;
  const pValue = pooledSe > 0 ? Math.min(1, 2 * (1 - normalCdf(Math.abs(zScore)))) : 1;
  const margin = 1.96 * unpooledSe;
  return {
    method: 'two_proportion_z_test',
    pValue: Math.round(pValue * 10000) / 10000,
    confidenceInterval: {
      absoluteLow: Math.round((diff - margin) * 10000) / 100,
      absoluteHigh: Math.round((diff + margin) * 10000) / 100,
      relativeLow: controlRate > 0 ? Math.round(((diff - margin) / controlRate) * 10000) / 100 : 0,
      relativeHigh: controlRate > 0 ? Math.round(((diff + margin) / controlRate) * 10000) / 100 : 0,
    },
  };
}

function getGuardrailThreshold(guardrail = {}) {
  const rawThreshold =
    guardrail.min_relative_lift ??
    guardrail.minRelativeLift ??
    guardrail.max_relative_lift ??
    guardrail.maxRelativeLift;
  const parsed = Number(rawThreshold);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return (guardrail.direction || 'increase') === 'decrease' ? 10 : -10;
}

function isGuardrailBreached(relativeLift, guardrail = {}, threshold = 0) {
  return (guardrail.direction || 'increase') === 'decrease'
    ? relativeLift > threshold
    : relativeLift < threshold;
}

function getConfiguredGoalEvents(goal = {}) {
  return (Array.isArray(goal.secondary) ? goal.secondary : [])
    .map(item => {
      if (!item) {
        return null;
      }
      const eventName = typeof item === 'object' ? item.event_name || item.eventName : item;
      if (!eventName) {
        return null;
      }
      return {
        eventName,
        label: typeof item === 'object' ? item.label || item.name || eventName : eventName,
        role: typeof item === 'object' ? item.metric_role || item.role || 'secondary' : 'secondary',
      };
    })
    .filter(Boolean);
}

function getRuntimeDays(test = {}) {
  if (!test?.started_at) {
    return 0;
  }
  const start = new Date(test.started_at);
  const stop = test.stopped_at ? new Date(test.stopped_at) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(stop.getTime())) {
    return 0;
  }
  return Math.max(0, Math.ceil((stop - start) / (24 * 60 * 60 * 1000)));
}

function buildGuardrailMetricSummary(test = {}, analytics = {}) {
  const variants = Array.isArray(analytics.variants) ? analytics.variants : [];
  const goal = parseGoalConfig(test?.goal);
  const configuredGuardrails = Array.isArray(goal.guardrails)
    ? goal.guardrails
    : Array.isArray(goal.guardrail_metrics)
      ? goal.guardrail_metrics
      : [];
  const secondaryGuardrails = (Array.isArray(goal.secondary) ? goal.secondary : []).filter(
    item => item && typeof item === 'object' && item.metric_role === 'guardrail'
  );
  const guardrails = [
    ...configuredGuardrails.map(item => ({ ...item, source: item.source || 'configured' })),
    ...secondaryGuardrails.map(item => ({ ...item, source: item.source || 'catalog_event' })),
  ];
  const control = variants[0] || null;
  if (!control || guardrails.length === 0) {
    return {
      configured: guardrails.length,
      status: guardrails.length > 0 ? 'insufficient_data' : 'not_configured',
      metrics: [],
    };
  }

  const metrics = guardrails.map((guardrail, index) => {
    const isEventGuardrail = Boolean(guardrail.event_name || guardrail.eventName);
    const metric = isEventGuardrail
      ? guardrail.event_name || guardrail.eventName
      : normalizeGoalMetric(guardrail.metric || guardrail.type || 'conversion_rate');
    const threshold = getGuardrailThreshold(guardrail);
    const controlValue = isEventGuardrail
      ? getSecondaryMetricValue(control, guardrail)
      : getMetricValue(control, metric);
    const evaluated = variants.slice(1).map(variant => {
      const value = isEventGuardrail
        ? getSecondaryMetricValue(variant, guardrail)
        : getMetricValue(variant, metric);
      const relativeLift = getRelativeLift(value, controlValue);
      const stats =
        isEventGuardrail || metric === 'conversion_rate' || metric === 'conversions'
          ? buildProportionComparison(
              isEventGuardrail ? controlValue : control.conversions,
              control.visitors,
              isEventGuardrail ? value : variant.conversions,
              variant.visitors
            )
          : null;
      return {
        variantId: variant.id,
        variantName: variant.name,
        value,
        relativeLift: Math.round(relativeLift * 100) / 100,
        pValue: stats?.pValue ?? null,
        confidenceInterval: stats?.confidenceInterval ?? null,
        method: stats?.method ?? 'point_estimate',
        breached: isGuardrailBreached(relativeLift, guardrail, threshold),
        reason: isGuardrailBreached(relativeLift, guardrail, threshold)
          ? `${variant.name || variant.id} moved ${Math.round(relativeLift * 100) / 100}% against the ${threshold}% guardrail threshold.`
          : null,
      };
    });
    return {
      id: String(guardrail.id || guardrail.key || `guardrail-${index + 1}`),
      metric,
      label: guardrail.label || guardrail.name || metric,
      source: guardrail.source || 'configured',
      aggregation: guardrail.aggregation || (isEventGuardrail ? 'count' : undefined),
      direction: guardrail.direction || 'increase',
      threshold,
      status: evaluated.some(item => item.breached) ? 'breached' : 'clear',
      breachReasons: evaluated
        .filter(item => item.breached)
        .map(item => item.reason)
        .filter(Boolean),
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
  const ordered = Boolean(funnel?.semantics?.ordered);
  return {
    mode: funnel.mode || 'step_reach',
    status: 'active',
    description: ordered
      ? 'Funnel is counting distinct users who reach each step after the previous step.'
      : 'Funnel is counting distinct-user reach per step independently.',
    ordered,
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
      minimumRecommendedVisitors: 500,
    },
  };
}

function buildMissingGoalWarnings(goal = {}, analytics = {}) {
  const stats = analytics.secondaryEventStats || {};
  return getConfiguredGoalEvents(goal)
    .filter(item => (Number(stats[item.eventName]?.totalEvents) || 0) <= 0)
    .map(item => ({
      code: 'goal_event_waiting',
      eventName: item.eventName,
      label: item.label,
      role: item.role,
      severity: item.role === 'guardrail' ? 'blocker' : 'warning',
      message: `${item.label} has not been detected in event reporting yet.`,
    }));
}

function buildPromotionReadiness({
  test = {},
  goal = {},
  analytics = {},
  guardrails = {},
  funnel = null,
}) {
  const blockers = [];
  const warnings = [];
  const totalVisitors = Number(analytics.summary?.totalVisitors) || 0;
  const runtimeDays = getRuntimeDays(test);
  const minimumRuntimeDays = Number(goal.minimum_runtime_days || goal.min_runtime_days || 7);
  const hasWinner = Boolean(
    analytics.significance?.winner ||
    analytics.significance?.winnerVariantId ||
    analytics.significance?.significant
  );

  if (analytics.srm?.detected) {
    blockers.push({
      code: 'srm_detected',
      label: 'Sample ratio mismatch detected',
      detail: analytics.srm.message || 'Traffic split does not match the configured allocation.',
    });
  }
  if (guardrails.status === 'breached') {
    blockers.push({
      code: 'guardrail_breached',
      label: 'Guardrail breached',
      detail:
        guardrails.metrics
          ?.flatMap(metric => metric.breachReasons || [])
          .filter(Boolean)
          .join(' ') || 'One or more guardrails moved outside the configured threshold.',
    });
  }
  if (totalVisitors < 100) {
    blockers.push({
      code: 'sample_size_insufficient',
      label: 'Insufficient sample size',
      detail: `${totalVisitors} visitors collected. Collect at least 100 before promotion decisions.`,
    });
  } else if (totalVisitors < 500) {
    warnings.push({
      code: 'sample_size_low',
      label: 'Low sample size',
      detail: `${totalVisitors} visitors collected. 500+ visitors is recommended for stable reads.`,
    });
  }
  if (runtimeDays > 0 && runtimeDays < minimumRuntimeDays) {
    warnings.push({
      code: 'minimum_runtime',
      label: 'Minimum runtime not reached',
      detail: `Test has run ${runtimeDays} day${runtimeDays === 1 ? '' : 's'}; ${minimumRuntimeDays} days is recommended.`,
    });
  }
  if (!hasWinner) {
    warnings.push({
      code: 'no_statistical_winner',
      label: 'No statistical winner yet',
      detail: 'The leading variant can be promoted manually, but evidence is not yet decisive.',
    });
  }

  buildMissingGoalWarnings(goal, analytics).forEach(item => {
    const target = item.severity === 'blocker' ? blockers : warnings;
    target.push({
      code: item.code,
      label: item.label,
      detail: item.message,
    });
  });
  if (Array.isArray(funnel?.warnings) && funnel.warnings.length > 0) {
    warnings.push(
      ...funnel.warnings.map(warning => ({
        code: warning.code || 'funnel_warning',
        label: warning.stepId || 'Funnel warning',
        detail: warning.message || 'Funnel configuration needs review.',
      }))
    );
  }

  return {
    canPromote: blockers.length === 0,
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'review' : 'ready',
    blockers,
    warnings,
    checks: {
      totalVisitors,
      runtimeDays,
      minimumRuntimeDays,
      hasWinner,
      missingGoalEvents: buildMissingGoalWarnings(goal, analytics).length,
    },
  };
}

async function getExperimentDecisionOverview(testId, shopDomain, options = {}) {
  const [test, analytics] = await Promise.all([
    getTestById(testId, shopDomain),
    analyticsService.getTestAnalytics(testId, shopDomain, options),
  ]);
  const goal = parseGoalConfig(test?.goal);
  const { primaryMetric, secondaryMetric } = resolveGoalMetricSelections(goal);
  let funnel = null;
  let funnelError = null;
  try {
    funnel = await getFunnelMetrics(testId, shopDomain, {
      ...options,
      funnel_steps: goal?.funnel_steps,
      funnel_mode: goal?.funnel_mode,
      conversionWindowDays: goal?.conversion_window_days,
      conversionUrl: goal?.conversion_url,
    });
  } catch (error) {
    funnelError = {
      code: 'funnel_unavailable',
      message: 'Funnel metrics could not be calculated for this decision overview.',
    };
    logger.error('Experiment decision funnel calculation failed', error);
  }

  const guardrails = buildGuardrailMetricSummary(test, analytics);
  const promotionReadiness = buildPromotionReadiness({
    test,
    goal,
    analytics,
    guardrails,
    funnel,
  });
  const recommendations = [
    analytics.srm?.detected ? 'Investigate sample ratio mismatch before trusting results.' : null,
    analytics.summary?.totalVisitors < 500
      ? 'Collect more traffic before acting on small lifts.'
      : null,
    guardrails.status === 'breached'
      ? 'Review guardrail breaches before promoting a winner.'
      : null,
    funnelError
      ? 'Funnel readiness could not be calculated. Review tracking before promotion.'
      : null,
    promotionReadiness.warnings.length > 0 && promotionReadiness.canPromote
      ? 'Review warnings before changing traffic allocation.'
      : null,
  ].filter(Boolean);

  return {
    testId,
    shopDomain,
    primaryMetric,
    secondaryMetric,
    analysisMethod: analytics.analysisMethod || 'frequentist',
    statistics: buildStatisticsReadiness(analytics),
    guardrails,
    funnel: funnel
      ? {
          ...funnel,
          orderedScaffold: buildOrderedFunnelScaffold(funnel),
        }
      : null,
    funnelError,
    promotionReadiness,
    recommendations,
  };
}

module.exports = {
  buildGuardrailMetricSummary,
  buildOrderedFunnelScaffold,
  buildPromotionReadiness,
  buildStatisticsReadiness,
  getExperimentDecisionOverview,
};
