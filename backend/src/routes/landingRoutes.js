const express = require('express');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getLandingClients } = require('../services/landingContentService');

const router = express.Router();

router.get(
  '/clients',
  asyncHandler(async (_req, res) => {
    const result = await getLandingClients({ includeFallback: true });
    res.set('Cache-Control', 'public, max-age=120');
    return res.json({ success: true, data: result });
  })
);

module.exports = router;
