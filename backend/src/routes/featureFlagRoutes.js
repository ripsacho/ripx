const express = require('express');
const { asyncHandler } = require('../middleware/asyncHandler');
const { evaluateFlag, evaluateFlags } = require('../services/featureFlagService');
const { normalizeDomain } = require('../models/tenant');

const router = express.Router();

router.get(
  '/evaluate',
  asyncHandler(async (req, res) => {
    const rawKeys = req.query.keys || req.query.key || '';
    const keys = String(rawKeys)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 50);
    const domain =
      normalizeDomain(req.query.shop || req.query.shop_domain || req.query.domain || '') || '';
    if (keys.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide key or keys' });
    }
    const flags =
      keys.length === 1
        ? { [keys[0]]: await evaluateFlag(keys[0], { domain }) }
        : await evaluateFlags(keys, { domain });
    return res.json({ success: true, flags });
  })
);

module.exports = router;
