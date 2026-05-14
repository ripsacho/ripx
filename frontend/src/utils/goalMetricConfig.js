export const GOAL_PRIMARY_METRICS = [
  'revenue',
  'conversion_rate',
  'revenue_per_visitor',
  'profit_per_visitor',
  'aov',
];

const GOAL_METRIC_LABELS = {
  revenue: 'Revenue',
  conversion_rate: 'Conversion',
  revenue_per_visitor: 'RPV',
  profit_per_visitor: 'PPV',
  aov: 'AOV',
};

export function normalizeGoalPrimaryMetric(value, fallback = 'revenue') {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  return GOAL_PRIMARY_METRICS.includes(key) ? key : fallback;
}

export function normalizeGoalSecondaryMetric(primaryMetric, rawSecondary) {
  const primary = normalizeGoalPrimaryMetric(primaryMetric);
  const secondary = String(rawSecondary || '')
    .trim()
    .toLowerCase();
  if (!secondary || !GOAL_PRIMARY_METRICS.includes(secondary) || secondary === primary) {
    return null;
  }
  return secondary;
}

export function getGoalMetricLabel(metric) {
  const key = String(metric || '')
    .trim()
    .toLowerCase();
  return GOAL_METRIC_LABELS[key] || metric || '—';
}

export function resolveGoalMetricSelections(goal = {}) {
  const primaryMetric = normalizeGoalPrimaryMetric(goal.metric, 'conversion_rate');
  const secondaryMetric = normalizeGoalSecondaryMetric(
    primaryMetric,
    goal.secondary_metric ?? goal.secondaryMetric
  );
  return { primaryMetric, secondaryMetric };
}

export function buildGoalMetricTooltip(option = {}) {
  return [
    option.desc,
    option.useCase,
    option.interpretation,
    option.requiredData ? `Data needed: ${option.requiredData}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function getGoalCogsProfit(variant = {}, goalConfig = {}) {
  const revenue = Number(variant.revenue) || 0;
  const conversions = Number(variant.conversions) || 0;
  const cogs = goalConfig?.cogs;
  if (!cogs?.enabled) {
    return Number(variant.profit) || revenue;
  }
  if (cogs.type === 'fixed_per_order') {
    return revenue - conversions * (Number(cogs.value) || 0);
  }
  return revenue - revenue * ((Number(cogs.value) || 0) / 100);
}

export function getGoalBusinessMetricValue(
  variant = {},
  metric = 'conversion_rate',
  goalConfig = {}
) {
  const visitors = Number(variant.visitors) || 0;
  const revenue = Number(variant.revenue) || 0;
  const profit = getGoalCogsProfit(variant, goalConfig);
  const normalized = normalizeGoalPrimaryMetric(metric, 'conversion_rate');
  switch (normalized) {
    case 'revenue':
      return revenue;
    case 'aov':
      return Number(variant.avgOrderValue) || 0;
    case 'revenue_per_visitor':
      return visitors > 0 ? revenue / visitors : 0;
    case 'profit_per_visitor':
      return visitors > 0 ? profit / visitors : 0;
    case 'conversions':
      return Number(variant.conversions) || 0;
    case 'conversion_rate':
    default:
      return Number(variant.conversionRate) || 0;
  }
}

export function formatGoalBusinessMetricValue(value, metric = 'conversion_rate') {
  const normalized = normalizeGoalPrimaryMetric(metric, 'conversion_rate');
  if (normalized === 'conversion_rate') {
    return `${(Number(value) || 0).toFixed(2)}%`;
  }
  if (normalized === 'conversions') {
    return (Number(value) || 0).toLocaleString();
  }
  return `$${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
