const { query } = require('../utils/database');
const logger = require('../utils/logger');

const SUPPORT_INBOX_INTEGRATION_KV_KEY = 'support.inbox.integration';
const SUPPORT_INBOX_PROVIDERS = ['none', 'zendesk', 'helpscout'];
const SUPPORT_SYNC_TIMEOUT_MS = Math.min(
  Math.max(parseInt(process.env.SUPPORT_INBOX_SYNC_TIMEOUT_MS, 10) || 4000, 1000),
  10000
);

function normalizeProvider(rawValue) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase();
  if (SUPPORT_INBOX_PROVIDERS.includes(normalized)) {
    return normalized;
  }
  return 'none';
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  return fallback;
}

function parseJsonObject(rawValue) {
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

function sanitizeText(value, maxLength = 500) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function maskSecret(value) {
  const raw = String(value || '');
  if (!raw) {
    return '';
  }
  if (raw.length <= 6) {
    return `${raw.slice(0, 1)}***`;
  }
  return `${raw.slice(0, 3)}***${raw.slice(-2)}`;
}

function mapPriority(category) {
  const normalized = String(category || '')
    .trim()
    .toLowerCase();
  if (normalized === 'billing') {
    return 'high';
  }
  if (normalized === 'technical' || normalized === 'script_install') {
    return 'normal';
  }
  return 'low';
}

function buildDefaultConfig() {
  return {
    provider: normalizeProvider(process.env.SUPPORT_INBOX_PROVIDER || 'none'),
    enabled: toBoolean(process.env.SUPPORT_INBOX_ENABLED, false),
    zendesk: {
      subdomain: sanitizeText(process.env.SUPPORT_ZENDESK_SUBDOMAIN || '', 120),
      email: sanitizeText(process.env.SUPPORT_ZENDESK_EMAIL || '', 255),
      apiToken: sanitizeText(process.env.SUPPORT_ZENDESK_API_TOKEN || '', 500),
    },
    helpscout: {
      mailboxId: sanitizeText(process.env.SUPPORT_HELPSCOUT_MAILBOX_ID || '', 80),
      accessToken: sanitizeText(process.env.SUPPORT_HELPSCOUT_ACCESS_TOKEN || '', 500),
    },
    updated_at: null,
    updated_by: null,
  };
}

function normalizeConfig(rawConfig) {
  const defaults = buildDefaultConfig();
  const parsed = parseJsonObject(rawConfig) || {};
  const rawZendesk = parseJsonObject(parsed.zendesk) || {};
  const rawHelpscout = parseJsonObject(parsed.helpscout) || {};
  const provider = normalizeProvider(parsed.provider || defaults.provider);
  const enabled = toBoolean(parsed.enabled, defaults.enabled);
  return {
    provider,
    enabled,
    zendesk: {
      subdomain: sanitizeText(rawZendesk.subdomain || defaults.zendesk.subdomain, 120),
      email: sanitizeText(rawZendesk.email || defaults.zendesk.email, 255),
      apiToken: sanitizeText(rawZendesk.apiToken || defaults.zendesk.apiToken, 500),
    },
    helpscout: {
      mailboxId: sanitizeText(rawHelpscout.mailboxId || defaults.helpscout.mailboxId, 80),
      accessToken: sanitizeText(rawHelpscout.accessToken || defaults.helpscout.accessToken, 500),
    },
    updated_at: parsed.updated_at || defaults.updated_at,
    updated_by: parsed.updated_by || defaults.updated_by,
  };
}

function buildPublicConfig(config) {
  const normalized = normalizeConfig(config);
  return {
    provider: normalized.provider,
    enabled: Boolean(normalized.enabled),
    zendesk: {
      subdomain: normalized.zendesk.subdomain,
      email: normalized.zendesk.email,
      apiTokenMasked: maskSecret(normalized.zendesk.apiToken),
      hasApiToken: Boolean(normalized.zendesk.apiToken),
    },
    helpscout: {
      mailboxId: normalized.helpscout.mailboxId,
      accessTokenMasked: maskSecret(normalized.helpscout.accessToken),
      hasAccessToken: Boolean(normalized.helpscout.accessToken),
    },
    updated_at: normalized.updated_at || null,
    updated_by: normalized.updated_by || null,
  };
}

function validateConfig(config) {
  const normalized = normalizeConfig(config);
  if (!normalized.enabled || normalized.provider === 'none') {
    return null;
  }
  if (normalized.provider === 'zendesk') {
    if (!normalized.zendesk.subdomain) {
      return 'Zendesk subdomain is required when Zendesk integration is enabled';
    }
    if (!normalized.zendesk.email) {
      return 'Zendesk email is required when Zendesk integration is enabled';
    }
    if (!normalized.zendesk.apiToken) {
      return 'Zendesk API token is required when Zendesk integration is enabled';
    }
  }
  if (normalized.provider === 'helpscout') {
    if (!normalized.helpscout.mailboxId) {
      return 'Help Scout mailbox ID is required when Help Scout integration is enabled';
    }
    if (!normalized.helpscout.accessToken) {
      return 'Help Scout access token is required when Help Scout integration is enabled';
    }
  }
  return null;
}

async function getSupportInboxIntegrationConfig(options = {}) {
  const includeSecrets = Boolean(options.includeSecrets);
  const result = await query('SELECT value FROM key_value_store WHERE key = $1 LIMIT 1', [
    SUPPORT_INBOX_INTEGRATION_KV_KEY,
  ]).catch(() => ({ rows: [] }));
  const row = result.rows?.[0];
  const normalized = normalizeConfig(row?.value || null);
  return includeSecrets ? normalized : buildPublicConfig(normalized);
}

function mergeConfigWithInput(currentConfig, input, adminId) {
  const current = normalizeConfig(currentConfig);
  const payload = parseJsonObject(input) || {};
  const provider = normalizeProvider(payload.provider || current.provider);
  const enabled = toBoolean(payload.enabled, current.enabled);
  const payloadZendesk = parseJsonObject(payload.zendesk) || {};
  const payloadHelpscout = parseJsonObject(payload.helpscout) || {};

  const zendeskApiTokenRaw =
    typeof payloadZendesk.apiToken === 'string' ? payloadZendesk.apiToken.trim() : null;
  const helpscoutTokenRaw =
    typeof payloadHelpscout.accessToken === 'string' ? payloadHelpscout.accessToken.trim() : null;

  return {
    provider,
    enabled,
    zendesk: {
      subdomain:
        typeof payloadZendesk.subdomain === 'string'
          ? sanitizeText(payloadZendesk.subdomain, 120)
          : current.zendesk.subdomain,
      email:
        typeof payloadZendesk.email === 'string'
          ? sanitizeText(payloadZendesk.email, 255)
          : current.zendesk.email,
      apiToken:
        zendeskApiTokenRaw === null
          ? current.zendesk.apiToken
          : zendeskApiTokenRaw
            ? sanitizeText(zendeskApiTokenRaw, 500)
            : '',
    },
    helpscout: {
      mailboxId:
        typeof payloadHelpscout.mailboxId === 'string'
          ? sanitizeText(payloadHelpscout.mailboxId, 80)
          : current.helpscout.mailboxId,
      accessToken:
        helpscoutTokenRaw === null
          ? current.helpscout.accessToken
          : helpscoutTokenRaw
            ? sanitizeText(helpscoutTokenRaw, 500)
            : '',
    },
    updated_at: new Date().toISOString(),
    updated_by: adminId || null,
  };
}

async function upsertSupportInboxIntegrationConfig(input, adminId) {
  const current = await getSupportInboxIntegrationConfig({ includeSecrets: true });
  const merged = mergeConfigWithInput(current, input, adminId);
  const validationError = validateConfig(merged);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  await query(
    `INSERT INTO key_value_store (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [SUPPORT_INBOX_INTEGRATION_KV_KEY, JSON.stringify(merged)]
  );

  return { ok: true, config: buildPublicConfig(merged) };
}

async function callWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPPORT_SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function createZendeskTicket(config, ticket) {
  const subdomain = sanitizeText(config?.zendesk?.subdomain || '', 120);
  const email = sanitizeText(config?.zendesk?.email || '', 255);
  const apiToken = sanitizeText(config?.zendesk?.apiToken || '', 500);
  if (!subdomain || !email || !apiToken) {
    return { ok: false, provider: 'zendesk', error: 'missing_zendesk_credentials' };
  }

  const auth = Buffer.from(`${email}/token:${apiToken}`).toString('base64');
  const url = `https://${subdomain}.zendesk.com/api/v2/tickets.json`;
  const messageBody = [
    `RipX ticket id: ${ticket.id || 'unknown'}`,
    `Category: ${ticket.category || 'other'}`,
    `Shop: ${ticket.shopDomain || 'unknown'}`,
    '',
    String(ticket.message || ''),
  ].join('\n');

  const payload = {
    ticket: {
      subject: sanitizeText(ticket.subject || 'RipX support request', 200),
      comment: { body: messageBody.slice(0, 30000) },
      requester: {
        name: sanitizeText(ticket.email || 'RipX user', 120),
        email: sanitizeText(ticket.email || '', 255),
      },
      external_id: ticket.id ? String(ticket.id) : undefined,
      tags: [
        'ripx',
        'ripx_support',
        `ripx_category_${sanitizeText(ticket.category || 'other', 40).toLowerCase()}`,
      ],
      priority: mapPriority(ticket.category),
    },
  };

  const response = await callWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  const bodyJson = parseJsonObject(bodyText);
  if (!response.ok) {
    return {
      ok: false,
      provider: 'zendesk',
      status: response.status,
      error: `zendesk_http_${response.status}`,
      details: bodyJson || bodyText.slice(0, 500),
    };
  }
  return {
    ok: true,
    provider: 'zendesk',
    status: response.status,
    remote_id: bodyJson?.ticket?.id || null,
  };
}

async function createHelpScoutConversation(config, ticket) {
  const mailboxIdRaw = sanitizeText(config?.helpscout?.mailboxId || '', 80);
  const accessToken = sanitizeText(config?.helpscout?.accessToken || '', 500);
  if (!mailboxIdRaw || !accessToken) {
    return { ok: false, provider: 'helpscout', error: 'missing_helpscout_credentials' };
  }
  const mailboxIdNum = Number.parseInt(mailboxIdRaw, 10);
  const mailboxId = Number.isFinite(mailboxIdNum) ? mailboxIdNum : mailboxIdRaw;
  const url = 'https://api.helpscout.net/v2/conversations';
  const messageBody = [
    `RipX ticket id: ${ticket.id || 'unknown'}`,
    `Category: ${ticket.category || 'other'}`,
    `Shop: ${ticket.shopDomain || 'unknown'}`,
    '',
    String(ticket.message || ''),
  ].join('\n');

  const payload = {
    subject: sanitizeText(ticket.subject || 'RipX support request', 200),
    mailboxId,
    type: 'email',
    customer: {
      email: sanitizeText(ticket.email || '', 255),
    },
    threads: [
      {
        type: 'customer',
        customer: {
          email: sanitizeText(ticket.email || '', 255),
        },
        text: messageBody.slice(0, 30000),
      },
    ],
    status: 'active',
    tags: [
      'ripx',
      'ripx-support',
      `category-${sanitizeText(ticket.category || 'other', 40).toLowerCase()}`,
    ],
  };

  const response = await callWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  const bodyJson = parseJsonObject(bodyText);
  if (!response.ok) {
    return {
      ok: false,
      provider: 'helpscout',
      status: response.status,
      error: `helpscout_http_${response.status}`,
      details: bodyJson || bodyText.slice(0, 500),
    };
  }
  return {
    ok: true,
    provider: 'helpscout',
    status: response.status,
    remote_id: bodyJson?.id || null,
  };
}

async function syncSupportTicketToExternalInbox(ticketPayload) {
  const config = await getSupportInboxIntegrationConfig({ includeSecrets: true });
  if (!config.enabled || config.provider === 'none') {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const ticket = {
    id: ticketPayload?.id ? String(ticketPayload.id) : null,
    email: sanitizeText(ticketPayload?.email || '', 255),
    subject: sanitizeText(ticketPayload?.subject || '', 500),
    category: sanitizeText(ticketPayload?.category || 'other', 100),
    message: sanitizeText(ticketPayload?.message || '', 50000),
    shopDomain: sanitizeText(ticketPayload?.shopDomain || '', 255),
  };

  try {
    if (config.provider === 'zendesk') {
      return await createZendeskTicket(config, ticket);
    }
    if (config.provider === 'helpscout') {
      return await createHelpScoutConversation(config, ticket);
    }
    return { ok: true, skipped: true, reason: 'provider_not_supported' };
  } catch (err) {
    logger.warn('Support inbox sync failed', {
      provider: config.provider,
      ticketId: ticket.id,
      error: err?.message,
    });
    return { ok: false, provider: config.provider, error: err?.message || 'sync_failed' };
  }
}

module.exports = {
  SUPPORT_INBOX_INTEGRATION_KV_KEY,
  getSupportInboxIntegrationConfig,
  upsertSupportInboxIntegrationConfig,
  syncSupportTicketToExternalInbox,
};
