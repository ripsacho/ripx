const EventEmitter = require('events');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

const SUPPORT_TICKET_THREAD_LIMIT_DEFAULT = 200;
const SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH = 5000;
const THREAD_EVENT_BUS = new EventEmitter();
THREAD_EVENT_BUS.setMaxListeners(0);
let realtimePublisher = null;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeThreadSenderType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'admin' || normalized === 'system' || normalized === 'ai') {
    return normalized;
  }
  return 'user';
}

function parseJsonObjectSafe(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

function normalizeText(value, maxLength) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function normalizeLabel(value) {
  return normalizeText(value, 255);
}

function buildThreadMessageFromRow(row) {
  return {
    id: row.id,
    ticket_id: row.ticket_id,
    sender_type: normalizeThreadSenderType(row.sender_type),
    sender_label: row.sender_label || null,
    message: row.message || '',
    created_at: row.created_at || null,
    metadata: parseJsonObjectSafe(row.metadata),
  };
}

function buildThreadSeedMessage(ticketRow) {
  return {
    id: `ticket-seed-${ticketRow.id}`,
    ticket_id: ticketRow.id,
    sender_type: 'user',
    sender_label: ticketRow.email || ticketRow.shop_domain || 'Customer',
    message: ticketRow.message || '',
    created_at: ticketRow.created_at || null,
    metadata: {
      seed: true,
      source: 'support_ticket_created',
      category: ticketRow.category || null,
      status: ticketRow.status || 'open',
    },
  };
}

async function getSupportTicketById(ticketId) {
  const withDeletedSql = `
    SELECT id, user_id, email, subject, category, message, status, shop_domain, tenant_id, created_at, updated_at
    FROM support_tickets
    WHERE id = $1::uuid
      AND (deleted_at IS NULL)
    LIMIT 1
  `;
  const noDeletedSql = `
    SELECT id, user_id, email, subject, category, message, status, shop_domain, tenant_id, created_at, updated_at
    FROM support_tickets
    WHERE id = $1::uuid
    LIMIT 1
  `;
  try {
    const result = await query(withDeletedSql, [ticketId]);
    return result.rows?.[0] || null;
  } catch (err) {
    if (err.message && /deleted_at|column.*does not exist/i.test(err.message)) {
      const result = await query(noDeletedSql, [ticketId]);
      return result.rows?.[0] || null;
    }
    throw err;
  }
}

function isTicketOwnedByIdentity(ticketRow, identity = {}) {
  if (!ticketRow || !identity) {
    return false;
  }
  const ticketEmail = String(ticketRow.email || '')
    .trim()
    .toLowerCase();
  const identityEmail = String(identity.email || '')
    .trim()
    .toLowerCase();
  const ticketShop = String(ticketRow.shop_domain || '')
    .trim()
    .toLowerCase();
  const identityShop = String(identity.shopDomain || '')
    .trim()
    .toLowerCase();
  const ticketUserId = String(ticketRow.user_id || '').trim();
  const identityUserId = String(identity.userId || '').trim();
  return Boolean(
    (ticketEmail && identityEmail && ticketEmail === identityEmail) ||
    (ticketShop && identityShop && ticketShop === identityShop) ||
    (ticketUserId && identityUserId && ticketUserId === identityUserId)
  );
}

async function getSupportTicketForUser(ticketId, identity) {
  if (!ticketId || !UUID_REGEX.test(String(ticketId).trim())) {
    return null;
  }
  const row = await getSupportTicketById(String(ticketId).trim());
  if (!row) {
    return null;
  }
  return isTicketOwnedByIdentity(row, identity) ? row : null;
}

async function listSupportTicketThreadMessages(ticketRow, options = {}) {
  if (!ticketRow?.id) {
    return [];
  }
  const limit = Math.min(
    Math.max(parseInt(options.limit, 10) || SUPPORT_TICKET_THREAD_LIMIT_DEFAULT, 1),
    500
  );
  const seedMessage = buildThreadSeedMessage(ticketRow);
  try {
    const result = await query(
      `SELECT id, ticket_id, sender_type, sender_label, message, metadata, created_at
       FROM support_ticket_messages
       WHERE ticket_id = $1::uuid
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
      [ticketRow.id, limit]
    );
    const threadRows = (result.rows || []).map(buildThreadMessageFromRow);
    return [seedMessage, ...threadRows];
  } catch (err) {
    if (
      err.message &&
      (/support_ticket_messages|relation .* does not exist/i.test(err.message) ||
        /metadata|column.*does not exist/i.test(err.message))
    ) {
      return [seedMessage];
    }
    throw err;
  }
}

function emitSupportTicketThreadMessage(ticketId, message) {
  if (!ticketId || !message) {
    return;
  }
  THREAD_EVENT_BUS.emit(`support-ticket:${ticketId}`, message);
  if (typeof realtimePublisher === 'function') {
    realtimePublisher(ticketId, message);
  }
}

function subscribeSupportTicketThread(ticketId, handler) {
  const eventKey = `support-ticket:${ticketId}`;
  THREAD_EVENT_BUS.on(eventKey, handler);
  return () => {
    THREAD_EVENT_BUS.off(eventKey, handler);
  };
}

function setSupportTicketRealtimePublisher(publisher) {
  realtimePublisher = typeof publisher === 'function' ? publisher : null;
}

function normalizeThreadAudience(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === 'admin' ? 'admin' : 'user';
}

async function markSupportTicketThreadRead(ticketId, audience) {
  const normalizedTicketId = String(ticketId || '').trim();
  if (!normalizedTicketId || !UUID_REGEX.test(normalizedTicketId)) {
    return null;
  }
  const normalizedAudience = normalizeThreadAudience(audience);
  try {
    const result = await query(
      `INSERT INTO support_ticket_read_states (ticket_id, audience, last_read_at, updated_at)
       VALUES ($1::uuid, $2, NOW(), NOW())
       ON CONFLICT (ticket_id, audience)
       DO UPDATE SET last_read_at = GREATEST(support_ticket_read_states.last_read_at, EXCLUDED.last_read_at),
                     updated_at = NOW()
       RETURNING ticket_id, audience, last_read_at, updated_at`,
      [normalizedTicketId, normalizedAudience]
    );
    const row = result.rows?.[0];
    return row
      ? {
          ticket_id: row.ticket_id,
          audience: row.audience,
          last_read_at: row.last_read_at,
          updated_at: row.updated_at,
        }
      : null;
  } catch (err) {
    if (
      err.message &&
      (/support_ticket_read_states|relation .* does not exist/i.test(err.message) ||
        /audience|column.*does not exist/i.test(err.message))
    ) {
      return null;
    }
    throw err;
  }
}

async function getSupportTicketThreadReadState(ticketId, audience) {
  const normalizedTicketId = String(ticketId || '').trim();
  if (!normalizedTicketId || !UUID_REGEX.test(normalizedTicketId)) {
    return null;
  }
  const normalizedAudience = normalizeThreadAudience(audience);
  try {
    const result = await query(
      `SELECT ticket_id, audience, last_read_at, updated_at
       FROM support_ticket_read_states
       WHERE ticket_id = $1::uuid AND audience = $2
       LIMIT 1`,
      [normalizedTicketId, normalizedAudience]
    );
    const row = result.rows?.[0];
    return row
      ? {
          ticket_id: row.ticket_id,
          audience: row.audience,
          last_read_at: row.last_read_at,
          updated_at: row.updated_at,
        }
      : null;
  } catch (err) {
    if (
      err.message &&
      (/support_ticket_read_states|relation .* does not exist/i.test(err.message) ||
        /audience|column.*does not exist/i.test(err.message))
    ) {
      return null;
    }
    throw err;
  }
}

async function touchSupportTicketAfterReply(ticketId, senderType) {
  const normalizedSender = normalizeThreadSenderType(senderType);
  const withDeletedSqlAdmin = `
    UPDATE support_tickets
    SET status = CASE WHEN status IN ('closed', 'resolved') THEN 'open' ELSE status END,
        first_response_at = COALESCE(first_response_at, NOW()),
        updated_at = NOW()
    WHERE id = $1::uuid
      AND (deleted_at IS NULL)
  `;
  const noDeletedSqlAdmin = `
    UPDATE support_tickets
    SET status = CASE WHEN status IN ('closed', 'resolved') THEN 'open' ELSE status END,
        first_response_at = COALESCE(first_response_at, NOW()),
        updated_at = NOW()
    WHERE id = $1::uuid
  `;
  const withDeletedSqlUser = `
    UPDATE support_tickets
    SET status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
        updated_at = NOW()
    WHERE id = $1::uuid
      AND (deleted_at IS NULL)
  `;
  const noDeletedSqlUser = `
    UPDATE support_tickets
    SET status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
        updated_at = NOW()
    WHERE id = $1::uuid
  `;

  const withDeletedSql = normalizedSender === 'admin' ? withDeletedSqlAdmin : withDeletedSqlUser;
  const noDeletedSql = normalizedSender === 'admin' ? noDeletedSqlAdmin : noDeletedSqlUser;
  try {
    await query(withDeletedSql, [ticketId]);
  } catch (err) {
    if (
      err.message &&
      (/deleted_at|first_response_at|column.*does not exist/i.test(err.message) ||
        /support_tickets|relation .* does not exist/i.test(err.message))
    ) {
      await query(noDeletedSql, [ticketId]).catch(() => null);
      return;
    }
    throw err;
  }
}

async function createSupportTicketThreadMessage({
  ticketId,
  senderType,
  senderLabel,
  message,
  metadata,
}) {
  const normalizedTicketId = String(ticketId || '').trim();
  const normalizedSenderType = normalizeThreadSenderType(senderType);
  const messageText = normalizeText(message, SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH);
  if (!normalizedTicketId || !UUID_REGEX.test(normalizedTicketId)) {
    return { ok: false, error: 'invalid_ticket_id' };
  }
  if (!messageText) {
    return { ok: false, error: 'message_required' };
  }

  const metadataJson = metadata && typeof metadata === 'object' ? JSON.stringify(metadata) : null;
  let createdMessage = null;
  try {
    const result = await query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_type, sender_label, message, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
       RETURNING id, ticket_id, sender_type, sender_label, message, metadata, created_at`,
      [
        normalizedTicketId,
        normalizedSenderType,
        normalizeLabel(senderLabel),
        messageText,
        metadataJson,
      ]
    );
    createdMessage = buildThreadMessageFromRow(result.rows?.[0] || {});
  } catch (err) {
    if (
      err.message &&
      (/support_ticket_messages|relation .* does not exist/i.test(err.message) ||
        /metadata|column.*does not exist/i.test(err.message))
    ) {
      createdMessage = {
        id: `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ticket_id: normalizedTicketId,
        sender_type: normalizedSenderType,
        sender_label: normalizeLabel(senderLabel) || null,
        message: messageText,
        created_at: new Date().toISOString(),
        metadata: metadata && typeof metadata === 'object' ? metadata : null,
      };
    } else {
      throw err;
    }
  }

  try {
    await touchSupportTicketAfterReply(normalizedTicketId, normalizedSenderType);
  } catch (err) {
    logger.warn('Support ticket thread: failed to touch ticket after reply', {
      ticketId: normalizedTicketId,
      senderType: normalizedSenderType,
      error: err?.message,
    });
  }

  emitSupportTicketThreadMessage(normalizedTicketId, createdMessage);
  return { ok: true, message: createdMessage };
}

module.exports = {
  SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH,
  getSupportTicketById,
  getSupportTicketForUser,
  listSupportTicketThreadMessages,
  markSupportTicketThreadRead,
  getSupportTicketThreadReadState,
  createSupportTicketThreadMessage,
  subscribeSupportTicketThread,
  setSupportTicketRealtimePublisher,
};
