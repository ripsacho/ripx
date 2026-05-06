const RISK_LEVELS = Object.freeze({
  READ_ONLY: 'read_only',
  LOW_WRITE: 'low_write',
  TENANT_WRITE: 'tenant_write',
  SHOPIFY_WRITE: 'shopify_write',
  DESTRUCTIVE: 'destructive',
  CRITICAL: 'critical',
});

function canAutoExecuteTool(tool = {}) {
  return tool.risk === RISK_LEVELS.READ_ONLY;
}

function buildToolPolicy(tool = {}) {
  const risk = tool.risk || RISK_LEVELS.READ_ONLY;
  return {
    risk,
    auto_execute: risk === RISK_LEVELS.READ_ONLY,
    requires_confirmation: risk !== RISK_LEVELS.READ_ONLY,
    blocked:
      risk === RISK_LEVELS.CRITICAL ||
      (risk !== RISK_LEVELS.READ_ONLY &&
        String(process.env.SUPPORT_AGENT_ACTIONS_ENABLED || '').toLowerCase() !== 'true'),
  };
}

module.exports = {
  RISK_LEVELS,
  canAutoExecuteTool,
  buildToolPolicy,
};
