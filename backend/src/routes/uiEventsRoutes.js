/**
 * UI Events Routes
 *
 * Lightweight authenticated endpoint for app-shell interaction telemetry.
 * Stores events in audit_log for product analytics/debugging.
 */

const express = require('express');
const { asyncHandler } = require('../middleware/asyncHandler');
const auditLogService = require('../services/auditLogService');

const router = express.Router();

const ALLOWED_TOPBAR_EVENTS = new Set([
  'topbar_new_test_click',
  'topbar_user_menu_open',
  'topbar_user_menu_navigate',
  'topbar_user_menu_logout',
  'topbar_help_open',
  'topbar_help_navigate',
  'topbar_support_click',
  'topbar_notifications_open',
]);

function cleanString(value, max = 120) {
  if (value === undefined || value === null) {
    return null;
  }
  const s = String(value).trim();
  if (!s) {
    return null;
  }
  return s.slice(0, max);
}

function cleanContext(ctx) {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) {
    return {};
  }
  const out = {};
  Object.entries(ctx).forEach(([k, v]) => {
    const key = cleanString(k, 48);
    if (!key) {
      return;
    }
    if (typeof v === 'string') {
      out[key] = v.slice(0, 240);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
    } else if (v === null) {
      out[key] = null;
    }
  });
  return out;
}

/**
 * POST /api/ui-events
 * Body: { event, source?, target?, path?, context? }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const event = cleanString(req.body?.event, 80);
    if (!event || !ALLOWED_TOPBAR_EVENTS.has(event)) {
      return res.status(400).json({ success: false, error: 'Invalid or unsupported event.' });
    }

    const source = cleanString(req.body?.source, 40) || 'topbar';
    const target = cleanString(req.body?.target, 160);
    const path = cleanString(req.body?.path, 320);
    const context = cleanContext(req.body?.context);

    const shopDomain = req.shopDomain || '__auth__';
    const actorType = req.email ? 'email_session' : req.impersonation ? 'impersonation' : 'shop';
    const actorId = cleanString(req.email || req.shopDomain || req.adminId || 'unknown', 160);

    await auditLogService.log(shopDomain, {
      entityType: 'ui_event',
      entityId: event,
      action: 'topbar_interaction',
      userId: actorId,
      changes: {
        source,
        target,
        path,
        context,
      },
      actorType,
      actorId,
      ipAddress: req.ip || req.connection?.remoteAddress,
    });

    res.json({ success: true });
  })
);

module.exports = router;
