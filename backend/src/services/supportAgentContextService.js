const { normalizeDomain } = require('../models/tenant');
const { redactForLlm } = require('./supportAgentRedactionService');

function normalizeRouteContext(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return {
    pathname:
      String(raw.pathname || '')
        .trim()
        .slice(0, 300) || null,
    test_id:
      String(raw.test_id || raw.testId || '')
        .trim()
        .slice(0, 120) || null,
    page:
      String(raw.page || '')
        .trim()
        .slice(0, 120) || null,
  };
}

function resolveRequestedStore(req, body = {}) {
  void body;
  const raw =
    req.shopDomain ||
    req.query?.shop ||
    req.query?.store ||
    req.query?.domain ||
    req.headers['x-ripx-store'] ||
    req.headers['x-shopify-shop-domain'];
  return normalizeDomain(raw !== undefined && raw !== null ? String(raw) : '');
}

function buildSupportAgentContext(req, body = {}) {
  const shopDomain = resolveRequestedStore(req, body);
  const email = String(req.email || '').trim();
  const emailDomain = email.includes('@') ? email.split('@').pop().toLowerCase() : null;
  const context = {
    actor: {
      authenticated: true,
      user_id: req.userId || null,
      email_domain: emailDomain,
      auth_type: req.authType || null,
      role: req.userRole || req.domainRole || null,
    },
    store: {
      domain: shopDomain || null,
      selected: Boolean(shopDomain),
    },
    route_context: normalizeRouteContext(body.route_context || body.routeContext || {}),
  };
  return redactForLlm(context);
}

module.exports = {
  buildSupportAgentContext,
  resolveRequestedStore,
};
