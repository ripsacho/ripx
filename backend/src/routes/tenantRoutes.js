/**
 * Tenant Routes
 *
 * Multi-platform tenant management
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const { createStandaloneTenant } = require('../models/tenant');
const { sendSuccess, sendError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * POST /api/tenants/standalone
 * Register a standalone site (returns API key - store securely, single display)
 */
router.post(
  '/standalone',
  asyncHandler(async (req, res) => {
    const { domain } = req.body;

    if (!domain || typeof domain !== 'string') {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Domain is required');
    }

    try {
      const { tenant, apiKey } = await createStandaloneTenant(domain);

      return sendSuccess(res, HTTP_STATUS.CREATED, {
        tenant: {
          id: tenant.id,
          domain: tenant.domain,
          platform: tenant.platform,
        },
        apiKey,
        message:
          'Store your API key securely. It will not be shown again. Use it in the X-RipX-API-Key header.',
      });
    } catch (error) {
      if (error.message === 'Invalid domain') {
        return sendError(res, HTTP_STATUS.BAD_REQUEST, error.message);
      }
      if (error.message === 'Domain already registered') {
        return sendError(res, HTTP_STATUS.CONFLICT, error.message);
      }
      if (error.message === 'Use Shopify OAuth for Shopify stores') {
        return sendError(res, HTTP_STATUS.BAD_REQUEST, error.message);
      }
      throw error;
    }
  })
);

module.exports = router;
