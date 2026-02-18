/**
 * Targeting Preset Routes
 *
 * API endpoints for saved targeting presets
 */

const express = require('express');
const router = express.Router();
const validators = require('../utils/validators');
const {
  getPresetsByShop,
  createPreset,
  deletePreset,
} = require('../models/targetingPreset');
const { sendError } = require('../utils/response');

const validatePresetId = (req, res, next) => {
  const id = req.params?.id;
  if (!id || !validators.isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid preset ID format' });
  }
  next();
};

/**
 * GET /api/targeting-presets
 * List all presets for the shop
 */
router.get('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const presets = await getPresetsByShop(shopDomain);
    res.json({ success: true, presets });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/targeting-presets
 * Create or update a preset
 * Body: { name, segments, goal?, variants? } - goal and variants make it a full test template
 */
router.post('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const { name, segments, goal, variants } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Preset name is required',
      });
    }

    const preset = await createPreset(shopDomain, name.trim(), segments || {}, goal, variants);
    res.json({ success: true, preset });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/targeting-presets/:id
 * Delete a preset
 */
router.delete('/:id', validatePresetId, async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const deleted = await deletePreset(req.params.id, shopDomain);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Preset not found',
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
