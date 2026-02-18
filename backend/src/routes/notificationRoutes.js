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
router.get('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const unreadOnly = req.query.unread === 'true';

    let sql = `
      SELECT id, type, title, message, data, read, created_at
      FROM notifications
      WHERE shop_domain = $1
    `;
    const params = [shopDomain];

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
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', validateNotificationId, async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const { id } = req.params;

    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    await query(
      'UPDATE notifications SET read = true WHERE id = $1 AND shop_domain = $2',
      [id, shopDomain]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read
 */
router.put('/read-all', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;

    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    await query(
      'UPDATE notifications SET read = true WHERE shop_domain = $1 AND read = false',
      [shopDomain]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
