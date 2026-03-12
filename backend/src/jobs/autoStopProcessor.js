/**
 * Auto-Stop Processor
 *
 * Stops running tests when they reach statistical significance.
 * Significance uses each shop's confidence level from shop_settings (e.g. 95% → p < 0.05).
 * Only runs for shops with auto_stop_enabled in shop_settings.
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { updateTest } = require('../models/test');
const analyticsService = require('../services/analytics');
const notificationService = require('../services/notificationService');
const outboundWebhookService = require('../services/outboundWebhookService');
const { TEST_HEALTH } = require('../constants');

async function processAutoStop() {
  try {
    const { rows: shops } = await query(
      'SELECT shop_domain FROM shop_settings WHERE auto_stop_enabled = true'
    );

    if (shops.length === 0) {
      return;
    }

    const shopDomains = shops.map(s => s.shop_domain);

    const { rows: tests } = await query(
      `SELECT id, shop_domain, name FROM tests
       WHERE status = 'running' AND shop_domain = ANY($1)`,
      [shopDomains]
    );

    for (const test of tests) {
      try {
        const analytics = await analyticsService.getTestAnalytics(test.id, test.shop_domain);

        if (!analytics?.significance || !analytics?.variants) {
          continue;
        }
        if (analytics.variants.length < 2) {
          continue;
        }

        const { significant, pValue, winner } = analytics.significance;

        const minVisitors = Math.min(...analytics.variants.map(v => v.visitors || 0));
        if (minVisitors < TEST_HEALTH.MIN_VISITORS_PER_VARIANT) {
          continue;
        }

        if (significant && winner) {
          await updateTest(test.id, test.shop_domain, {
            status: 'stopped',
            stopped_at: new Date(),
          });

          // Resolve winner variant: 2-variant uses 'variantA'/'variantB'; 3+ uses 'best' + winnerVariantId
          const sig = analytics.significance;
          let winnerIndex = 0;
          if (winner === 'variantB' && analytics.variants.length >= 2) {
            winnerIndex = 1;
          } else if (winner === 'variantA') {
            winnerIndex = 0;
          } else if (
            winner === 'best' &&
            ((sig.winnerVariantId !== undefined && sig.winnerVariantId !== null) ||
              (sig.bestVariantId !== undefined && sig.bestVariantId !== null))
          ) {
            const winnerId = sig.winnerVariantId ?? sig.bestVariantId;
            const idx = analytics.variants.findIndex(
              v =>
                String(v.id) === String(winnerId) ||
                (v.id !== null && v.id !== undefined && v.id === winnerId)
            );
            if (idx >= 0) {
              winnerIndex = idx;
            }
          }
          const winnerVariant = analytics.variants[winnerIndex];
          const winnerName =
            winnerVariant?.name ||
            (winnerIndex === 1 && analytics.variants.length === 2
              ? 'Variant B'
              : `Variant ${winnerIndex + 1}`);

          await notificationService.createInAppNotification(test.shop_domain, {
            type: 'test_complete',
            title: 'Test auto-stopped (significant)',
            message: `"${test.name}" reached significance. Winner: ${winnerName} (p=${pValue.toFixed(4)})`,
            data: { testId: test.id, testName: test.name },
          });

          const stopAnalytics = await analyticsService.getTestAnalytics(test.id, test.shop_domain);
          await outboundWebhookService.fireWebhook(test.shop_domain, 'test_complete', {
            testId: test.id,
            testName: test.name,
            reason: 'auto_significance',
            analytics: stopAnalytics?.variants,
          });

          logger.info('Test auto-stopped on significance', {
            testId: test.id,
            shopDomain: test.shop_domain,
            pValue,
            winner: winnerName,
          });
        }
      } catch (err) {
        logger.error('Auto-stop check failed for test', {
          testId: test.id,
          error: err.message,
        });
      }
    }
  } catch (err) {
    logger.error('Auto-stop processor failed', { error: err.message });
  }
}

function startAutoStopProcessor() {
  const intervalMs = 15 * 60 * 1000;
  setInterval(processAutoStop, intervalMs);
  processAutoStop();
  logger.info('Auto-stop processor started', { intervalMinutes: 15 });
}

module.exports = {
  processAutoStop,
  startAutoStopProcessor,
};
