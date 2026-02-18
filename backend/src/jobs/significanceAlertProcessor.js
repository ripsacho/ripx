/**
 * Significance Alert Processor
 *
 * Fires webhook and in-app notification when a running test reaches statistical significance
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const analyticsService = require('../services/analytics');
const notificationService = require('../services/notificationService');
const outboundWebhookService = require('../services/outboundWebhookService');

async function processSignificanceAlerts() {
  try {
    const { rows } = await query(
      'SELECT id, shop_domain, name FROM tests WHERE status = \'running\''
    );

    for (const test of rows) {
      try {
        const analytics = await analyticsService.getTestAnalytics(
          test.id,
          test.shop_domain
        );

        if (!analytics?.significance || !analytics.significance.significant) {continue;}
        if (!analytics.variants || analytics.variants.length < 2) {continue;}

        const sig = analytics.significance;
        let winnerId = null;
        if (sig.winner === 'variantB') {
          winnerId = analytics.variants[1]?.id;
        } else if (sig.winner === 'variantA') {
          winnerId = analytics.variants[0]?.id;
        } else if (sig.winner === 'best' && (sig.winnerVariantId || sig.bestVariantId)) {
          winnerId = sig.winnerVariantId || sig.bestVariantId;
        }
        const winner = winnerId
          ? analytics.variants.find(v => v.id === winnerId)
          : (analytics.variants[1] || analytics.variants[0]);

        if (!winner) {continue;}

        let existing = [];
        try {
          const r = await query(
            'SELECT 1 FROM significance_alerts WHERE test_id = $1 AND shop_domain = $2',
            [test.id, test.shop_domain]
          );
          existing = r.rows;
        } catch (tblErr) {
          if (tblErr.message?.includes('significance_alerts')) {continue;}
          throw tblErr;
        }
        if (existing.length > 0) {continue;}

        try {
          await query(
          `INSERT INTO significance_alerts (test_id, shop_domain, winner_variant_id, winner_variant_name, lift, p_value)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (test_id, shop_domain) DO NOTHING`,
          [
            test.id,
            test.shop_domain,
            winner.id,
            winner.name,
            analytics.significance.lift ?? null,
            analytics.significance.pValue ?? null,
          ]
        );
        } catch (insErr) {
          if (insErr.message?.includes('duplicate') || insErr.code === '23505') {continue;}
          throw insErr;
        }

        try {
          await notificationService.createInAppNotification(test.shop_domain, {
          type: 'significance_reached',
          title: 'Test reached significance',
          message: `"${test.name}": ${winner.name} is winning with ${analytics.significance.lift ?? 0}% lift (p=${analytics.significance.pValue}).`,
          data: { testId: test.id, testName: test.name, winner: winner.name },
        });
        } catch (notifErr) {
          logger.warn('Significance notification failed', { testId: test.id, error: notifErr.message });
        }

        await outboundWebhookService.fireWebhook(test.shop_domain, 'significance', {
          testId: test.id,
          testName: test.name,
          winner: winner.name,
          winnerId: winner.id,
          lift: analytics.significance.lift,
          pValue: analytics.significance.pValue,
          variants: analytics.variants,
        });

        logger.info('Significance alert sent', {
          testId: test.id,
          winner: winner.name,
          lift: analytics.significance.lift,
        });
      } catch (err) {
        logger.error('Significance check failed for test', {
          testId: test.id,
          error: err.message,
        });
      }
    }
  } catch (err) {
    logger.error('Significance alert processor failed', { error: err.message });
  }
}

async function startSignificanceAlertProcessor() {
  const intervalMs = 15 * 60 * 1000;
  setInterval(processSignificanceAlerts, intervalMs);
  processSignificanceAlerts();
  logger.info('Significance alert processor started', { intervalMinutes: 15 });
}

module.exports = {
  processSignificanceAlerts,
  startSignificanceAlertProcessor,
};
