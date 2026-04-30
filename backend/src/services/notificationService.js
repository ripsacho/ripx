/**
 * Notification Service
 *
 * Handles email and in-app notifications for test results
 */

class NotificationService {
  buildTestAnalyticsUrl(test) {
    const appUrl = String(process.env.FRONTEND_URL || process.env.APP_URL || '').replace(
      /\/+$/,
      ''
    );
    const shopDomain = String(test?.shop_domain || test?.shopDomain || test?.domain || '').trim();
    const testId = encodeURIComponent(String(test?.id || ''));
    if (!appUrl || !testId) {
      return '';
    }
    if (shopDomain) {
      return `${appUrl}/app/${encodeURIComponent(shopDomain)}/tests/${testId}/analytics`;
    }
    return `${appUrl}/home`;
  }

  /**
   * Send test completion notification
   *
   * @param {Object} test - Test data
   * @param {Object} analytics - Test analytics
   * @param {string} recipientEmail - Recipient email
   * @returns {Promise<void>}
   */
  async sendTestCompletionNotification(test, analytics, recipientEmail) {
    // In production, integrate with email service (SendGrid, AWS SES, etc.)
    const subject = `AB Test Complete: ${test.name}`;

    const winner = analytics.significance?.winner
      ? analytics.variants.find(v => v.id === analytics.significance.winner)?.name
      : 'No clear winner';

    const analyticsUrl = this.buildTestAnalyticsUrl(test);
    const _body = `
      Your AB test "${test.name}" has completed.

      Results:
      - Winner: ${winner}
      - Confidence: ${analytics.significance?.confidence || 0}%
      - Lift: ${analytics.significance?.lift || 0}%
      - Revenue Impact: $${analytics.revenueImpact?.impact || 0}

      View full results: ${analyticsUrl}
    `;

    const logger = require('../utils/logger');
    const toSafe = recipientEmail ? `${recipientEmail.substring(0, 6)}…` : '';
    logger.info('Email notification', { to: toSafe, subject });

    // In production:
    // await emailService.send({
    //   to: recipientEmail,
    //   subject,
    //   body
    // });
  }

  /**
   * Send test significance notification
   *
   * @param {Object} test - Test data
   * @param {Object} analytics - Test analytics
   * @param {string} recipientEmail - Recipient email
   * @returns {Promise<void>}
   */
  async sendSignificanceNotification(test, analytics, recipientEmail) {
    if (!analytics.significance?.significant) {
      return; // Only send if significant
    }

    const subject = `AB Test Reached Significance: ${test.name}`;
    const analyticsUrl = this.buildTestAnalyticsUrl(test);
    const _body = `
      Your AB test "${test.name}" has reached statistical significance!

      Winner: ${analytics.significance.winner}
      Confidence: ${analytics.significance.confidence}%
      Lift: ${analytics.significance.lift}%

      View results: ${analyticsUrl}
    `;

    const logger = require('../utils/logger');
    const toSafe = recipientEmail ? `${recipientEmail.substring(0, 6)}…` : '';
    logger.info('Significance notification', { to: toSafe, subject });
  }

  /**
   * Create in-app notification
   *
   * @param {string} shopDomain - Shop domain (use '*' for system-wide)
   * @param {Object} notification - Notification data (type, title, message, data?, scope?)
   * @returns {Promise<void>}
   */
  async createInAppNotification(shopDomain, notification) {
    const { query } = require('../utils/database');
    const scope = notification.scope === 'all' ? 'all' : 'shop';
    const sql = `
      INSERT INTO notifications (
        shop_domain, type, title, message, data, read, scope, created_at
      )
      VALUES ($1, $2, $3, $4, $5, false, $6, NOW())
    `;
    await query(sql, [
      shopDomain,
      notification.type,
      notification.title,
      notification.message,
      JSON.stringify(notification.data || {}),
      scope,
    ]);
  }
}

module.exports = new NotificationService();
