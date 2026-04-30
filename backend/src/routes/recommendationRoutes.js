const express = require('express');
const { asyncHandler } = require('../middleware/asyncHandler');
const {
  buildRecommendationBlockConfig,
  listRecommendationTemplates,
} = require('../services/recommendationExperimentService');

const router = express.Router();

router.get(
  '/templates',
  asyncHandler((_req, res) => {
    return res.json({ success: true, templates: listRecommendationTemplates() });
  })
);

router.post(
  '/blocks/validate',
  asyncHandler((req, res) => {
    const config = buildRecommendationBlockConfig(req.body || {});
    return res.json({ success: true, config });
  })
);

module.exports = router;
