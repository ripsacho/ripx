/**
 * Guardrail Processor
 *
 * Auto-stops running tests when conversion rate drops below threshold vs control
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { updateTest } = require('../models/test');
const analyticsService = require('../services/analytics');
const notificationService = require('../services/notificationService');
const outboundWebhookService = require('../services/outboundWebhookService');

async function processGuardrails() {
  try {
    const { rows } = await query(
      `SELECT id, shop_domain, name, guardrail_config
       FROM tests
       WHERE status = 'running'
         AND guardrail_config IS NOT NULL
         AND (guardrail_config->>'enabled')::boolean = true`
    );

    for (const test of rows) {
      try {
        const config = test.guardrail_config || {};
        const minDropPercent = config.minDropPercent ?? 10;

        const analytics = await analyticsService.getTestAnalytics(test.id, test.shop_domain);

        if (!analytics?.variants || analytics.variants.length < 2) {
          continue;
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

          if (dropPercent >= minDropPercent && variant.visitors >= 100) {
            await updateTest(test.id, test.shop_domain, {
              status: 'stopped',
              stopped_at: new Date(),
            });

            await notificationService.createInAppNotification(test.shop_domain, {
              type: 'guardrail_triggered',
              title: 'Test auto-stopped (guardrail)',
              message: `"${test.name}" stopped: ${variant.name} dropped ${dropPercent.toFixed(1)}% vs control.`,
              data: { testId: test.id, testName: test.name },
            });

            const stopAnalytics = await analyticsService.getTestAnalytics(
              test.id,
              test.shop_domain
            );
            await outboundWebhookService.fireWebhook(test.shop_domain, 'test_complete', {
              testId: test.id,
              testName: test.name,
              reason: 'guardrail',
              analytics: stopAnalytics?.variants,
            });

            logger.info('Guardrail triggered, test stopped', {
              testId: test.id,
              variant: variant.name,
              dropPercent,
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
