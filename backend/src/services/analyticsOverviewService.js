function toNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function getVariantRate(variant = {}) {
  const visitors = toNumber(variant.visitors);
  return visitors > 0 ? (toNumber(variant.conversions) / visitors) * 100 : 0;
}

function summarizeTest(test = {}) {
  const variants = Array.isArray(test.variants) ? test.variants : [];
  const totals = variants.reduce(
    (acc, variant) => {
      acc.visitors += toNumber(variant.visitors);
      acc.conversions += toNumber(variant.conversions);
      acc.revenue += toNumber(variant.revenue);
      return acc;
    },
    { visitors: 0, conversions: 0, revenue: 0 }
  );
  const conversionRate = totals.visitors > 0 ? (totals.conversions / totals.visitors) * 100 : 0;
  const control = variants[0] || null;
  const controlRate = control ? getVariantRate(control) : 0;
  const bestVariant = variants.reduce((best, variant) => {
    if (!best) {
      return variant;
    }
    return getVariantRate(variant) > getVariantRate(best) ? variant : best;
  }, null);
  const bestRate = bestVariant ? getVariantRate(bestVariant) : 0;
  const liftVsControl = controlRate > 0 ? ((bestRate - controlRate) / controlRate) * 100 : 0;
  const health = test.health || {};
  const srmDetected = Boolean(health.srm?.detected || test.analytics_meta?.srm?.detected);
  const riskLevel = String(health.riskSignals?.level || '').toLowerCase();
  const healthScore = toNumber(health.score ?? test.quality_score);
  const status = String(test.status || 'draft').toLowerCase();
  const hasGuardrailRisk =
    riskLevel === 'high' ||
    riskLevel === 'critical' ||
    (Array.isArray(health.issues) &&
      health.issues.some(issue =>
        String(issue || '')
          .toLowerCase()
          .includes('guardrail')
      ));
  const needsTraffic = status === 'running' && totals.visitors < 500;
  const missingConversions =
    status === 'running' && totals.visitors >= 100 && totals.conversions === 0;
  const winnerReady =
    ['running', 'completed'].includes(status) &&
    totals.visitors >= 500 &&
    totals.conversions > 0 &&
    bestVariant &&
    control &&
    String(bestVariant.id || bestVariant.name) !== String(control.id || control.name) &&
    liftVsControl >= 5 &&
    !srmDetected &&
    !hasGuardrailRisk;

  return {
    id: test.id,
    name: test.name || 'Unnamed test',
    type: test.type || 'unknown',
    status,
    createdAt: test.created_at || null,
    startedAt: test.started_at || null,
    stoppedAt: test.stopped_at || null,
    variantCount: variants.length,
    visitors: totals.visitors,
    conversions: totals.conversions,
    revenue: Math.round(totals.revenue * 100) / 100,
    conversionRate: Math.round(conversionRate * 100) / 100,
    revenuePerVisitor:
      totals.visitors > 0 ? Math.round((totals.revenue / totals.visitors) * 100) / 100 : 0,
    healthScore,
    healthLevel: health.healthLevel || null,
    srmDetected,
    hasGuardrailRisk,
    needsTraffic,
    missingConversions,
    winnerReady,
    bestVariant: bestVariant
      ? {
          id: bestVariant.id || bestVariant.name,
          name: bestVariant.name || bestVariant.id,
          conversionRate: Math.round(bestRate * 100) / 100,
          liftVsControl: Math.round(liftVsControl * 100) / 100,
        }
      : null,
    attentionReasons: [
      srmDetected ? 'Sample ratio mismatch' : null,
      hasGuardrailRisk ? 'Guardrail or risk signal' : null,
      needsTraffic ? 'Needs traffic' : null,
      missingConversions ? 'No conversions yet' : null,
      healthScore > 0 && healthScore < 60 ? 'Low quality score' : null,
    ].filter(Boolean),
  };
}

function increment(map, key) {
  const safeKey = key || 'unknown';
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function buildAnalyticsPortfolioOverview(tests = []) {
  const rows = tests.map(summarizeTest);
  const totals = rows.reduce(
    (acc, row) => {
      acc.tests += 1;
      acc.visitors += row.visitors;
      acc.conversions += row.conversions;
      acc.revenue += row.revenue;
      increment(acc.statusCounts, row.status);
      increment(acc.typeCounts, row.type);
      if (row.winnerReady) {
        acc.winnerReady += 1;
      }
      if (row.needsTraffic) {
        acc.needsTraffic += 1;
      }
      if (row.srmDetected) {
        acc.srmRisks += 1;
      }
      if (row.hasGuardrailRisk) {
        acc.guardrailRisks += 1;
      }
      if (row.attentionReasons.length > 0) {
        acc.needsAttention += 1;
      }
      return acc;
    },
    {
      tests: 0,
      visitors: 0,
      conversions: 0,
      revenue: 0,
      winnerReady: 0,
      needsTraffic: 0,
      srmRisks: 0,
      guardrailRisks: 0,
      needsAttention: 0,
      statusCounts: {},
      typeCounts: {},
    }
  );
  totals.conversionRate = totals.visitors > 0 ? (totals.conversions / totals.visitors) * 100 : 0;
  totals.revenue = Math.round(totals.revenue * 100) / 100;

  const topTests = [...rows]
    .filter(row => row.visitors > 0)
    .sort((a, b) => b.revenue - a.revenue || b.conversionRate - a.conversionRate)
    .slice(0, 8);
  const attentionQueue = [...rows]
    .filter(row => row.attentionReasons.length > 0)
    .sort((a, b) => {
      const riskDelta = b.attentionReasons.length - a.attentionReasons.length;
      if (riskDelta !== 0) {
        return riskDelta;
      }
      return b.visitors - a.visitors;
    })
    .slice(0, 8);
  const chartData = [...rows]
    .filter(row => row.status === 'running' && row.visitors > 0)
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 10)
    .map(row => ({
      id: row.id,
      name: row.name.length > 16 ? `${row.name.slice(0, 16)}...` : row.name,
      visitors: row.visitors,
      conversions: row.conversions,
      revenue: row.revenue,
      conversionRate: row.conversionRate,
      revenuePerVisitor: row.revenuePerVisitor,
      liftVsControl: row.bestVariant?.liftVsControl || 0,
      healthScore: row.healthScore,
    }));

  const nextAction =
    attentionQueue[0] ||
    rows.find(row => row.winnerReady) ||
    rows.find(row => row.status === 'draft') ||
    null;

  return {
    totals,
    readiness: {
      winnerReady: totals.winnerReady,
      needsTraffic: totals.needsTraffic,
      needsAttention: totals.needsAttention,
      healthyRunning: rows.filter(
        row => row.status === 'running' && row.attentionReasons.length === 0 && row.visitors > 0
      ).length,
    },
    statusRows: Object.entries(totals.statusCounts).map(([status, count]) => ({ status, count })),
    typeRows: Object.entries(totals.typeCounts).map(([type, count]) => ({ type, count })),
    topTests,
    attentionQueue,
    chartData,
    tests: rows,
    nextAction,
  };
}

module.exports = {
  buildAnalyticsPortfolioOverview,
  summarizeTest,
};
