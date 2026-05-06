const router = require('express').Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const { runSupportAgent } = require('../services/supportAgentService');
const { verifyConfirmationToken } = require('../services/supportAgentConfirmationService');
const { executeConfirmedAgentAction } = require('../services/supportAgentActionService');

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (String(process.env.SUPPORT_AGENT_ENABLED || 'true').toLowerCase() === 'false') {
      return res.status(503).json({
        success: false,
        error: 'RipX Agent is currently disabled.',
      });
    }
    const result = await runSupportAgent(req, req.body || {});
    return res.json(result);
  })
);

router.post(
  '/actions/confirm',
  asyncHandler(async (req, res) => {
    if (String(process.env.SUPPORT_AGENT_ACTIONS_ENABLED || '').toLowerCase() !== 'true') {
      return res.status(403).json({
        success: false,
        error: 'RipX Agent actions are disabled.',
      });
    }
    const token = req.body?.confirmation_token || req.body?.confirmationToken;
    const payload = verifyConfirmationToken(token, req);
    const executed = await executeConfirmedAgentAction(req, payload);
    return res.json({
      success: true,
      ...executed,
    });
  })
);

module.exports = router;
