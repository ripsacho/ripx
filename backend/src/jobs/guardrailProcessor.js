/**
 * Guardrail Processor
 *
 * Auto-stops running tests when conversion rate drops below threshold vs control
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { updateTest } = require('../models/test');
const notificationService = require('../services/notificationService');
const outboundWebhookService = require('../services/outboundWebhookService');
const { buildGuardrailMetricSummary } = require('../services/experimentDecisionService');
const { getAutomationAnalytics } = require('./analyticsAutomation');

function clampPercent(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function resolveGuardrailQueryRows(result) {
  if (!Array.isArray(result?.rows)) {
    return [];
  }
  return result.rows;
}

async function stopForGuardrail({
  test,
  analytics,
  variantName,
  reason,
  rollbackPercent,
  autoRollback,
  hasActivePersonalization,
}) {
  let rollbackSummary = 'none';
  if (test.status === 'running') {
    await updateTest(test.id, test.shop_domain, {
      status: 'stopped',
      stopped_at: new Date(),
    });
    rollbackSummary = 'test_stopped';
  }
  if (autoRollback && hasActivePersonalization) {
    if (rollbackPercent > 0) {
      await updateTest(test.id, test.shop_domain, {
        personalization_mode: 'rollout',
        rollout_percent: rollbackPercent,
        rollout_schedule: null,
        rollout_started_at: new Date(),
      });
      rollbackSummary = `rollout_${rollbackPercent}%`;
    } else {
      await updateTest(test.id, test.shop_domain, {
        personalization_mode: 'none',
        rollout_percent: 0,
        rollout_schedule: null,
        rollout_started_at: null,
      });
      rollbackSummary = 'control_only';
    }
  }

  await notificationService.createInAppNotification(test.shop_domain, {
    type: 'guardrail_triggered',
    title: 'Test auto-stopped (guardrail)',
    message: `"${test.name}" stopped: ${reason}. Rollback: ${rollbackSummary}.`,
    data: { testId: test.id, testName: test.name, rollbackSummary },
  });

  await outboundWebhookService.fireWebhook(test.shop_domain, 'test_complete', {
    testId: test.id,
    testName: test.name,
    reason: 'guardrail',
    rollback: rollbackSummary,
    analytics: analytics?.variants,
    analyticsScope: analytics?.automationScope,
  });

  logger.info('Guardrail triggered, test stopped', {
    testId: test.id,
    variant: variantName,
    reason,
    rollbackSummary,
  });
}

async function processGuardrails() {
  try {
    let rows = [];
    try {
      const result = await query(
        `SELECT id, shop_domain, name, status, goal, guardrail_config, personalization_mode
         FROM tests
         WHERE (
             (guardrail_config IS NOT NULL AND (guardrail_config->>'enabled')::boolean = true)
             OR jsonb_array_length(COALESCE(goal->'guardrails', '[]'::jsonb)) > 0
             OR jsonb_array_length(COALESCE(goal->'guardrail_metrics', '[]'::jsonb)) > 0
             OR jsonb_path_exists(COALESCE(goal->'secondary', '[]'::jsonb), '$[*] ? (@.metric_role == "guardrail")')
           )
           AND (
             status = 'running'
             OR personalization_mode IN ('rollout', 'personalized')
           )`
      );
      rows = resolveGuardrailQueryRows(result);
    } catch (err) {
      if (!String(err?.message || '').includes('personalization_mode')) {
        throw err;
      }
      const fallback = await query(
        `SELECT id, shop_domain, name, status, goal, guardrail_config
         FROM tests
         WHERE status = 'running'
           AND (
             (guardrail_config IS NOT NULL AND (guardrail_config->>'enabled')::boolean = true)
             OR jsonb_array_length(COALESCE(goal->'guardrails', '[]'::jsonb)) > 0
             OR jsonb_array_length(COALESCE(goal->'guardrail_metrics', '[]'::jsonb)) > 0
             OR jsonb_path_exists(COALESCE(goal->'secondary', '[]'::jsonb), '$[*] ? (@.metric_role == "guardrail")')
           )`
      );
      rows = resolveGuardrailQueryRows(fallback);
    }

    for (const test of rows) {
      try {
        const config = test.guardrail_config || {};
        const minDropPercent = config.minDropPercent ?? 10;
        const minVisitors = Math.max(10, Number(config.minVisitorsPerVariant || 100));
        const autoRollback = config.autoRollback !== false;
        const rollbackPercent = clampPercent(
          config.rollbackToPercent ?? config.rollbackPercent ?? 0,
          0
        );
        const personalizationMode = String(test.personalization_mode || 'none')
          .trim()
          .toLowerCase();
        const hasActivePersonalization =
          personalizationMode === 'rollout' || personalizationMode === 'personalized';

        const analytics = await getAutomationAnalytics(test.id, test.shop_domain);

        if (!analytics?.variants || analytics.variants.length < 2) {
          continue;
        }

        const guardrailSummary = buildGuardrailMetricSummary(test, analytics);
        const breachedMetric = guardrailSummary.metrics?.find(metric =>
          metric.variants?.some(item => item.breached)
        );
        if (breachedMetric) {
          const breachedVariant = breachedMetric.variants.find(item => item.breached);
          const variant = analytics.variants.find(item => item.id === breachedVariant?.variantId);
          if ((variant?.visitors || 0) >= minVisitors) {
            await stopForGuardrail({
              test,
              analytics,
              variantName: breachedVariant?.variantName || variant?.name || 'Variant',
              reason: `${breachedMetric.label || breachedMetric.metric} guardrail breached (${breachedVariant.relativeLift}% vs control)`,
              rollbackPercent,
              autoRollback,
              hasActivePersonalization,
            });
            continue;
          }
        }

        const control = analytics.variants[0];
        const controlRate =
          control.visitors > 0 ? (control.conversions / control.visitors) * 100 : 0;

        if (controlRate === 0) {
          continue;
        }

        for (let i = 1; i < analytics.variants.length; i++) {
          const variant = analytics.variants[i];
          const variantRate =
            variant.visitors > 0 ? (variant.conversions / variant.visitors) * 100 : 0;

          const dropPercent = ((controlRate - variantRate) / controlRate) * 100;

          if (dropPercent >= minDropPercent && variant.visitors >= minVisitors) {
            await stopForGuardrail({
              test,
              analytics,
              variantName: variant.name,
              reason: `${variant.name} dropped ${dropPercent.toFixed(1)}% vs control`,
              rollbackPercent,
              autoRollback,
              hasActivePersonalization,
            });
            break;
          }
        }
      } catch (err) {
        logger.error('Guardrail check failed for test', {
          testId: test.id,
          error: err.message,
        });
      }
    }
  } catch (err) {
    logger.error('Guardrail processor failed', { error: err.message });
  }
}

async function startGuardrailProcessor() {
  const intervalMs = 15 * 60 * 1000;
  setInterval(processGuardrails, intervalMs);
  processGuardrails();
  logger.info('Guardrail processor started', { intervalMinutes: 15 });
}

module.exports = {
  processGuardrails,
  startGuardrailProcessor,
};
