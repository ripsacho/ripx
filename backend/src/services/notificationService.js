/**
 * Notification Service
 *
 * Handles email and in-app notifications for test results
 */

class NotificationService {
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

    const body = `
      Your AB test "${test.name}" has completed.

      Results:
      - Winner: ${winner}
      - Confidence: ${analytics.significance?.confidence || 0}%
      - Lift: ${analytics.significance?.lift || 0}%
      - Revenue Impact: $${analytics.revenueImpact?.impact || 0}

      View full results: ${process.env.APP_URL}/tests/${test.id}/analytics
    `;

    console.log('Email notification:', { to: recipientEmail, subject, body });

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
    const body = `
      Your AB test "${test.name}" has reached statistical significance!

      Winner: ${analytics.significance.winner}
      Confidence: ${analytics.significance.confidence}%
      Lift: ${analytics.significance.lift}%

      View results: ${process.env.APP_URL}/tests/${test.id}/analytics
    `;

    console.log('Significance notification:', { to: recipientEmail, subject, body });
  }

  /**
   * Create in-app notification
   *
   * @param {string} shopDomain - Shop domain
   * @param {Object} notification - Notification data
   * @returns {Promise<void>}
   */
  async createInAppNotification(shopDomain, notification) {
    // Store notification in database for in-app display
    const { query } = require('../utils/database');

    const sql = `
      INSERT INTO notifications (
        shop_domain, type, title, message, data, read, created_at
      )
      VALUES ($1, $2, $3, $4, $5, false, NOW())
    `;

    await query(sql, [
      shopDomain,
      notification.type,
      notification.title,
      notification.message,
      JSON.stringify(notification.data || {})
    ]);
  }
}

module.exports = new NotificationService();

