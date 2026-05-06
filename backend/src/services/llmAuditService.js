const crypto = require('crypto');
const auditLogService = require('./auditLogService');

function hashPrompt(value) {
  return `sha256:${crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex')}`;
}

function logAgentEvent(
  req,
  { action, conversationId, model, tools, outcome, latencyMs, prompt, changes }
) {
  return auditLogService.log(req.shopDomain || '__auth__', {
    entityType: 'llm_run',
    entityId: conversationId || null,
    action: action || 'agent_event',
    userId: req.userId || null,
    actorType: req.authType || 'user',
    actorId: req.userId || req.email || req.shopDomain || 'unknown',
    ipAddress: req.ip || req.connection?.remoteAddress,
    changes: {
      conversation_id: conversationId || null,
      model: model || null,
      tools: Array.isArray(tools) ? tools : [],
      outcome: outcome || null,
      latency_ms: latencyMs || null,
      prompt_hash: prompt ? hashPrompt(prompt) : null,
      redaction_applied: true,
      ...(changes && typeof changes === 'object' ? changes : {}),
    },
  });
}

module.exports = {
  hashPrompt,
  logAgentEvent,
};
