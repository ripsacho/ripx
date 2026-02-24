/**
 * Notification Routes
 *
 * API endpoints for in-app notifications
 */

const express = require('express');
const router = express.Router();
const validators = require('../utils/validators');
const { query } = require('../utils/database');
const { sendError } = require('../utils/response');
const { asyncHandler } = require('../middleware/asyncHandler');

const validateNotificationId = (req, res, next) => {
  const id = req.params?.id;
  if (!id || !validators.isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid notification ID format' });
  }
  next();
};

/**
 * GET /api/notifications
 * Get notifications for the current shop
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const rawLimit =
      req.query.limit !== undefined && req.query.limit !== '' ? parseInt(req.query.limit, 10) : 20;
    const limit = Math.min(Number.isNaN(rawLimit) || rawLimit <= 0 ? 20 : rawLimit, 50);
    const unreadOnly = req.query.unread === 'true';

    let sql = `
    SELECT id, type, title, message, data, read, scope, created_at
    FROM notifications
    WHERE shop_domain = $1 OR (shop_domain = $2 AND (scope = 'all' OR scope IS NULL))
  `;
    const params = [shopDomain, '*'];

    if (unreadOnly) {
      sql += ' AND read = false';
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await query(sql, params);

    const notifications = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data || {},
      read: row.read,
      scope: row.scope || 'shop',
      createdAt: row.created_at,
    }));

    const unreadCount = unreadOnly
      ? notifications.length
      : (
          await query(
            'SELECT COUNT(*) FROM notifications WHERE shop_domain = $1 AND read = false',
            [shopDomain]
          )
        ).rows[0].count;

    res.json({
      success: true,
      notifications,
      unreadCount: parseInt(unreadCount, 10),
    });
  })
);

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
router.put(
  '/:id/read',
  validateNotificationId,
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    const { id } = req.params;

    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    await query('UPDATE notifications SET read = true WHERE id = $1 AND shop_domain = $2', [
      id,
      shopDomain,
    ]);

    res.json({ success: true });
  })
);

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put(
  '/read-all',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;

    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    await query('UPDATE notifications SET read = true WHERE shop_domain = $1 AND read = false', [
      shopDomain,
    ]);

    res.json({ success: true });
  })
);

module.exports = router;
