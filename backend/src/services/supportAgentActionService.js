const { query } = require('../utils/database');
const auditLogService = require('./auditLogService');
const { syncSupportTicketToExternalInbox } = require('./supportInboxIntegrationService');
const { createPlannerDraft } = require('./experimentPlannerService');

const SUBJECT_MAX = 500;
const MESSAGE_MAX = 5000;

function normalizeSubject(value) {
  const subject = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  return subject.slice(0, SUBJECT_MAX) || 'RipX Agent support request';
}

function normalizeMessage(value) {
  return String(value || '')
    .trim()
    .slice(0, MESSAGE_MAX);
}

async function createSupportTicketFromAgent(req, args = {}) {
  const email = String(req.email || args.email || '')
    .trim()
    .toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error(
      'A verified email session is required to create a support ticket from RipX Agent.'
    );
    error.status = 400;
    throw error;
  }

  const subject = normalizeSubject(args.subject);
  const message =
    normalizeMessage(args.message) ||
    'RipX Agent created this ticket from the current assistant conversation.';
  const category = String(args.category || 'technical')
    .trim()
    .toLowerCase()
    .slice(0, 100);
  const metadata = {
    source: 'ripx_agent',
    conversation_id: args.conversation_id || null,
    route_context: args.route_context || null,
    category_source: 'agent_proposed',
  };

  const result = await query(
    `INSERT INTO support_tickets
       (user_id, email, subject, category, message, tenant_id, shop_domain, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, created_at`,
    [
      req.userId || null,
      email,
      subject,
      category,
      message,
      req.tenantId || null,
      req.shopDomain || null,
      JSON.stringify(metadata),
    ]
  );
  const ticket = result.rows?.[0] || null;

  await auditLogService.log(req.shopDomain || '__support__', {
    entityType: 'support_ticket',
    entityId: ticket?.id ? String(ticket.id) : null,
    action: 'agent_created',
    userId: req.userId || null,
    actorType: req.authType || 'user',
    actorId: req.userId || req.email || 'unknown',
    ipAddress: req.ip || req.connection?.remoteAddress,
    changes: {
      source: 'ripx_agent',
      category,
      subjectLength: subject.length,
      conversation_id: args.conversation_id || null,
    },
  });

  await syncSupportTicketToExternalInbox({
    id: ticket?.id,
    email,
    subject,
    category,
    message,
    shopDomain: req.shopDomain || null,
  }).catch(() => null);

  return {
    ticket_id: ticket?.id || null,
    created_at: ticket?.created_at || null,
    subject,
    category,
  };
}

async function createFeatureRequestFromAgent(req, args = {}) {
  const title = normalizeSubject(args.title || args.subject).slice(0, 180);
  const details = normalizeMessage(args.details || args.message);
  if (!title) {
    const error = new Error('Feature request title is required.');
    error.status = 400;
    throw error;
  }

  const metadata = {
    source: 'ripx_agent',
    conversation_id: args.conversation_id || null,
    route_context: args.route_context || null,
    category: 'feature_request',
  };
  const result = await query(
    `INSERT INTO support_feature_requests
       (user_id, tenant_id, shop_domain, email, title, details, status, vote_count, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', 0, $7::jsonb)
     RETURNING id, title, status, vote_count, created_at`,
    [
      req.userId || null,
      req.tenantId || null,
      req.shopDomain || null,
      req.email || null,
      title,
      details,
      JSON.stringify(metadata),
    ]
  );
  const row = result.rows?.[0] || null;

  await auditLogService.log(req.shopDomain || '__support__', {
    entityType: 'support_feature_request',
    entityId: row?.id ? String(row.id) : null,
    action: 'agent_created',
    userId: req.userId || null,
    actorType: req.authType || 'user',
    actorId: req.userId || req.email || 'unknown',
    ipAddress: req.ip || req.connection?.remoteAddress,
    changes: {
      source: 'ripx_agent',
      titleLength: title.length,
      conversation_id: args.conversation_id || null,
    },
  });

  return {
    feature_request_id: row?.id || null,
    title: row?.title || title,
    status: row?.status || 'open',
    vote_count: Number(row?.vote_count) || 0,
    created_at: row?.created_at || null,
  };
}

async function createDraftTestPlanFromAgent(req, args = {}) {
  const brief = normalizeMessage(args.brief || args.message || args.prompt);
  const objective = normalizeSubject(args.objective || args.subject || brief).slice(0, 180);
  const draft = createPlannerDraft({
    brief,
    objective,
    type: args.type || args.test_type || 'content',
    metric: args.metric || 'conversion_rate',
    audience: args.audience || 'All eligible storefront visitors',
  });

  await auditLogService.log(req.shopDomain || '__support__', {
    entityType: 'agent_test_plan',
    entityId: args.conversation_id || null,
    action: 'agent_drafted',
    userId: req.userId || null,
    actorType: req.authType || 'user',
    actorId: req.userId || req.email || 'unknown',
    ipAddress: req.ip || req.connection?.remoteAddress,
    changes: {
      source: 'ripx_agent',
      persisted: false,
      objectiveLength: objective.length,
      conversation_id: args.conversation_id || null,
    },
  });

  return {
    ...draft,
    persisted: false,
    launchable: false,
  };
}

async function executeConfirmedAgentAction(req, payload) {
  if (payload.action === 'create_support_ticket') {
    return {
      action: payload.action,
      result: await createSupportTicketFromAgent(req, payload.args || {}),
    };
  }
  if (payload.action === 'create_feature_request') {
    return {
      action: payload.action,
      result: await createFeatureRequestFromAgent(req, payload.args || {}),
    };
  }
  if (payload.action === 'draft_test_plan') {
    return {
      action: payload.action,
      result: await createDraftTestPlanFromAgent(req, payload.args || {}),
    };
  }
  const error = new Error(`Unsupported agent action: ${payload.action || 'unknown'}`);
  error.status = 400;
  throw error;
}

module.exports = {
  createSupportTicketFromAgent,
  createFeatureRequestFromAgent,
  createDraftTestPlanFromAgent,
  executeConfirmedAgentAction,
};
