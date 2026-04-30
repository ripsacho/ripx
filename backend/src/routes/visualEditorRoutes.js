const express = require('express');
const { asyncHandler } = require('../middleware/asyncHandler');
const {
  buildPostMessageContract,
  createVisualEditorSession,
  validateVisualEdit,
} = require('../services/visualEditorContractService');

const router = express.Router();

router.post(
  '/sessions',
  asyncHandler((req, res) => {
    const session = createVisualEditorSession({
      shopDomain: req.shopDomain,
      testId: req.body?.testId || req.body?.test_id,
      previewUrl: req.body?.previewUrl || req.body?.preview_url,
      appOrigin: req.get('origin'),
    });
    return res.json({
      success: true,
      session,
      postMessage: buildPostMessageContract(session),
    });
  })
);

router.post(
  '/validate-edit',
  asyncHandler((req, res) => {
    const validation = validateVisualEdit(req.body || {});
    return res.status(validation.valid ? 200 : 400).json({ success: validation.valid, validation });
  })
);

module.exports = router;
