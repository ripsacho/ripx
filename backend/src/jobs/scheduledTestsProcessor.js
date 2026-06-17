/**
 * Scheduled Tests Processor
 *
 * Auto-start and auto-stop tests based on schedule
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { scheduledTestsQueue } = require('./queue');

const { getTestById, updateTest } = require('../models/test');
const { runActivationPreflight } = require('../services/testActivationService');
const notificationService = require('../services/notificationService');
const outboundWebhookService = require('../services/outboundWebhookService');
const { getAutomationAnalytics } = require('./analyticsAutomation');

async function processScheduledStart(testId) {
  try {
    const { rows } = await query('SELECT id, shop_domain, name, status FROM tests WHERE id = $1', [
      testId,
    ]);
    const test = rows[0];
    if (!test || test.status !== 'draft') {
      return;
    }

    const fullTest = await getTestById(testId, test.shop_domain);
    if (!fullTest) {
      return;
    }
    const preflight = await runActivationPreflight(fullTest, test.shop_domain);
    if (!preflight.ok) {
      logger.warn('Scheduled start blocked by activation preflight', {
        testId,
        shopDomain: test.shop_domain,
        errors: Array.isArray(preflight.errors) ? preflight.errors.length : 0,
        warnings: Array.isArray(preflight.warnings) ? preflight.warnings.length : 0,
      });
      return;
    }

    await updateTest(testId, test.shop_domain, { status: 'running', started_at: new Date() });
    logger.info('Test auto-started', { testId, shopDomain: test.shop_domain });
  } catch (err) {
    logger.error('Scheduled start failed', { testId, error: err.message });
  }
}

async function processScheduledStop(testId) {
  try {
    const { rows } = await query('SELECT id, shop_domain, name, status FROM tests WHERE id = $1', [
      testId,
    ]);
    const test = rows[0];
    if (!test || test.status !== 'running') {
      return;
    }

    await updateTest(testId, test.shop_domain, { status: 'stopped', stopped_at: new Date() });

    const analytics = await getAutomationAnalytics(testId, test.shop_domain);

    await notificationService.createInAppNotification(test.shop_domain, {
      type: 'test_complete',
      title: 'Test completed',
      message: `"${test.name}" has been stopped.`,
      data: { testId, testName: test.name },
    });

    await outboundWebhookService.fireWebhook(test.shop_domain, 'test_complete', {
      testId,
      testName: test.name,
      analytics: analytics?.variants,
      analyticsScope: analytics?.automationScope,
    });

    logger.info('Test auto-stopped', { testId, shopDomain: test.shop_domain });
  } catch (err) {
    logger.error('Scheduled stop failed', { testId, error: err.message });
  }
}

function scheduleTestJobs(test) {
  if (!scheduledTestsQueue) {
    return;
  }

  const {
    id,
    shop_domain: _shop_domain,
    scheduled_start_at,
    scheduled_stop_at,
    auto_start,
    auto_stop,
  } = test;

  if (auto_start && scheduled_start_at) {
    const delay = new Date(scheduled_start_at) - Date.now();
    if (delay > 0) {
      scheduledTestsQueue.add({ action: 'start', testId: id }, { delay });
    }
  }

  if (auto_stop && scheduled_stop_at) {
    const delay = new Date(scheduled_stop_at) - Date.now();
    if (delay > 0) {
      scheduledTestsQueue.add({ action: 'stop', testId: id }, { delay });
    }
  }
}

if (scheduledTestsQueue) {
  scheduledTestsQueue.process(async job => {
    const { action, testId } = job.data;
    if (action === 'start') {
      await processScheduledStart(testId);
    }
    if (action === 'stop') {
      await processScheduledStop(testId);
    }
  });
}

module.exports = {
  scheduleTestJobs,
  processScheduledStart,
  processScheduledStop,
};
