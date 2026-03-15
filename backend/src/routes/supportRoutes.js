/**
 * Support routes: ticket submission (public) and "My tickets" (authenticated).
 * Uses existing emailService for notifications. See docs/CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md.
 */

const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { query } = require('../utils/database');
const { asyncHandler } = require('../middleware/asyncHandler');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const emailService = require('../services/emailService');
const auditLogService = require('../services/auditLogService');
const logger = require('../utils/logger');

const SUPPORT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'support');
const SUPPORT_UPLOAD_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const SUPPORT_UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

try {
  if (!fs.existsSync(SUPPORT_UPLOAD_DIR)) {
    fs.mkdirSync(SUPPORT_UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  logger.warn('Support upload dir creation failed', { dir: SUPPORT_UPLOAD_DIR, error: e.message });
}

const supportUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SUPPORT_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = (file.originalname && path.extname(file.originalname)) || '.bin';
      const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase())
        ? ext
        : '.bin';
      cb(null, `${uuidv4()}${safeExt}`);
    },
  }),
  limits: { fileSize: SUPPORT_UPLOAD_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (SUPPORT_UPLOAD_ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
    }
  },
});

const SUPPORT_EMAIL_TO = process.env.SUPPORT_EMAIL_TO || process.env.SMTP_FROM;
const CATEGORIES = ['technical', 'billing', 'feature_request', 'script_install', 'other'];
const CATEGORY_LABELS = {
  technical: 'Technical / Script',
  billing: 'Billing',
  feature_request: 'Feature request',
  script_install: 'Script / Install help',
  other: 'Other',
};
const MAX_MESSAGE_LENGTH = 5000;
const MAX_SUBJECT_LENGTH = 500;

/**
 * GET /api/support/categories
 * Return allowed categories (for form dropdowns). No auth required.
 */
router.get('/categories', (req, res) => {
  res.json({
    success: true,
    categories: CATEGORIES.map(value => ({ value, label: CATEGORY_LABELS[value] || value })),
  });
});

/**
 * POST /api/support/upload
 * Upload image for support chat. Max 5MB, 1-2 files; types: JPEG, PNG, GIF, WebP.
 * Returns { success, urls: string[] } for use in chat attachmentUrls.
 */
router.post(
  '/upload',
  optionalAuthenticate,
  (req, res, next) => {
    supportUpload.array('files', 2)(req, res, err => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large (max 5MB per file)'
            : err.message || 'Upload failed';
        return res.status(400).json({ success: false, error: message });
      }
      next();
    });
  },
  asyncHandler((req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }
    const base = '/api/support/uploads';
    const urls = req.files.map(f => `${base}/${path.basename(f.filename)}`);
    return res.json({ success: true, urls });
  })
);

/**
 * GET /api/support/uploads/:filename
 * Serve an uploaded support image (for in-app display and optional Vision in chat).
 */
router.get('/uploads/:filename', (req, res, next) => {
  const filename = path.basename(req.params.filename);
  if (!filename || filename.includes('..')) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }
  const filepath = path.join(SUPPORT_UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath) || !fs.statSync(filepath).isFile()) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  const ext = path.extname(filename).toLowerCase();
  const mime =
    {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    }[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.sendFile(filepath, { maxAge: 86400 }, err => (err && !res.headersSent ? next(err) : null));
});

function escapeHtml(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * POST /api/support/ticket
 * Create a support ticket. Auth optional; if present, tenant_id and shop_domain are set for "My tickets".
 * Rate limit applied at app level (e.g. 10/15min per IP).
 */
router.post(
  '/ticket',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const { email, subject, category, message } = req.body || {};
    const rawEmail = typeof email === 'string' ? email.trim() : '';
    const rawSubject = typeof subject === 'string' ? subject.trim() : '';
    const rawCategory = typeof category === 'string' ? category.trim().toLowerCase() : '';
    const rawMessage = typeof message === 'string' ? message.trim() : '';

    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required',
      });
    }
    if (!rawSubject) {
      return res.status(400).json({
        success: false,
        error: 'Subject is required',
      });
    }
    if (rawSubject.length > MAX_SUBJECT_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Subject must be ${MAX_SUBJECT_LENGTH} characters or less`,
      });
    }
    if (!rawMessage) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }
    if (rawMessage.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Message must be ${MAX_MESSAGE_LENGTH} characters or less`,
      });
    }
    const categoryVal = rawCategory && CATEGORIES.includes(rawCategory) ? rawCategory : 'other';

    let userId = null;
    let tenantId = null;
    let shopDomain = null;
    if (req.userId) {
      userId = req.userId;
    }
    if (req.tenantId) {
      tenantId = req.tenantId;
    }
    if (req.shopDomain && typeof req.shopDomain === 'string') {
      shopDomain = req.shopDomain;
    }

    const result = await query(
      `INSERT INTO support_tickets (user_id, email, subject, category, message, tenant_id, shop_domain)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [userId, rawEmail, rawSubject, categoryVal, rawMessage, tenantId, shopDomain]
    );
    const row = result.rows[0];
    const ticketId = row.id;

    const safeSubject = escapeHtml(rawSubject);
    const safeMessage = escapeHtml(rawMessage).replace(/\n/g, '<br>');
    const ticketIdShort = String(ticketId).slice(0, 8);
    const subjectForEmail = rawSubject.replace(/\s+/g, ' ').trim().slice(0, MAX_SUBJECT_LENGTH);

    if (SUPPORT_EMAIL_TO) {
      try {
        const toSupportHtml = `
        <p><strong>New support request #${ticketIdShort}</strong></p>
        <p>From: ${escapeHtml(rawEmail)}</p>
        <p>Category: ${escapeHtml(categoryVal)}</p>
        <p>Subject: ${safeSubject}</p>
        ${tenantId ? `<p>Tenant ID: ${escapeHtml(String(tenantId))}</p>` : ''}
        ${shopDomain ? `<p>Shop: ${escapeHtml(shopDomain)}</p>` : ''}
        <div class="divider"></div>
        <p>${safeMessage}</p>
      `;
        const toSupportText = `New support request #${ticketIdShort}\nFrom: ${rawEmail}\nCategory: ${categoryVal}\nSubject: ${rawSubject}\n\n${rawMessage}`;
        await emailService.sendMail({
          to: SUPPORT_EMAIL_TO,
          subject: `[RipX Support] #${ticketIdShort}: ${subjectForEmail}`,
          text: toSupportText,
          html: `<!DOCTYPE html><html><body style="font-family:sans-serif;">${toSupportHtml}</body></html>`,
        });
      } catch (supportEmailErr) {
        logger.warn('Support ticket: notification to support team failed', {
          ticketId,
          error: supportEmailErr?.message,
        });
      }
    }

    const toUserHtml = `
      <p>We've received your support request.</p>
      <p><strong>Ticket #${ticketIdShort}</strong></p>
      <p>Subject: ${safeSubject}</p>
      <p>We'll get back to you as soon as we can, usually within 24 hours.</p>
      <p class="muted">You can view your requests from the Support page in the app.</p>
    `;
    try {
      await emailService.sendMail({
        to: rawEmail,
        subject: `RipX Support: We received your request #${ticketIdShort}`,
        text: `We've received your support request #${ticketIdShort}. Subject: ${subjectForEmail}. We'll reply within 24 hours.`,
        html: `<!DOCTYPE html><html><body style="font-family:sans-serif;">${toUserHtml}</body></html>`,
      });
    } catch (userEmailErr) {
      logger.warn('Support ticket: user confirmation email failed', {
        ticketId,
        error: userEmailErr?.message,
      });
      // Ticket was created and support was notified; still return success
    }

    logger.info('Support ticket created', {
      ticketId,
      email: rawEmail.substring(0, 6) + '…',
      category: categoryVal,
    });

    try {
      auditLogService.log(req.shopDomain || '__support__', {
        entityType: 'support_ticket',
        entityId: String(ticketId),
        action: 'created',
        userId: userId || null,
        changes: { category: categoryVal, subjectLength: rawSubject.length },
      });
    } catch (auditErr) {
      logger.warn('Support ticket audit log failed', { ticketId, error: auditErr?.message });
    }

    return res.status(201).json({
      success: true,
      ticket_id: ticketId,
      message: 'Support request received. We will reply by email.',
    });
  })
);

const TICKETS_LIST_LIMIT = 100;

/**
 * GET /api/support/tickets
 * List tickets for the authenticated user (by email or shop_domain).
 * Requires authenticate.
 */
router.get(
  '/tickets',
  authenticate,
  asyncHandler(async (req, res) => {
    const byEmail = req.email && typeof req.email === 'string';
    const byShop = req.shopDomain && typeof req.shopDomain === 'string';

    if (!byEmail && !byShop) {
      return res.status(400).json({
        success: false,
        error: 'Cannot list tickets: missing email or shop context',
      });
    }

    let result;
    const baseWhereEmail = 'WHERE LOWER(email) = LOWER($1)';
    const baseWhereShop = 'WHERE LOWER(shop_domain) = LOWER($1)';
    const deletedFilter = ' AND (deleted_at IS NULL)';
    const orderLimit = ' ORDER BY created_at DESC LIMIT $2';
    const selectCols =
      'SELECT id, subject, category, status, created_at, updated_at FROM support_tickets ';
    try {
      if (byEmail) {
        result = await query(selectCols + baseWhereEmail + deletedFilter + orderLimit, [
          req.email.trim(),
          TICKETS_LIST_LIMIT,
        ]);
      } else {
        result = await query(selectCols + baseWhereShop + deletedFilter + orderLimit, [
          req.shopDomain.trim(),
          TICKETS_LIST_LIMIT,
        ]);
      }
    } catch (err) {
      if (err.message && /deleted_at|column.*does not exist/i.test(err.message)) {
        if (byEmail) {
          result = await query(selectCols + baseWhereEmail + orderLimit, [
            req.email.trim(),
            TICKETS_LIST_LIMIT,
          ]);
        } else {
          result = await query(selectCols + baseWhereShop + orderLimit, [
            req.shopDomain.trim(),
            TICKETS_LIST_LIMIT,
          ]);
        }
      } else {
        throw err;
      }
    }

    return res.json({
      success: true,
      tickets: result.rows.map(r => ({
        id: r.id,
        subject: r.subject,
        category: r.category,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    });
  })
);

const CHAT_MAX_MESSAGE_LENGTH = 2000;
const CHAT_SYSTEM_PROMPT =
  "You are a helpful support assistant for RipX, an A/B testing platform for Shopify and e-commerce. Answer briefly and clearly. If the question is about setup, tests, targeting, or the storefront script, use general knowledge about A/B testing and RipX. If you're not sure or the question is outside scope, say so and suggest the user contact support via the contact form. Do not make up features or API details.";
const CHAT_SYSTEM_PROMPT_RAG = context =>
  `You are a helpful support assistant for RipX, an A/B testing platform. Use ONLY the following context from the knowledge base to answer. If the answer is not in the context, say so and suggest the user use the Contact us form. Do not make up features or API details.

Context:
${context}`;

const CHAT_MAX_HISTORY = 10;
const RAG_TOP_K = 5;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * RAG: embed query and fetch top-k chunks from support_kb_chunks. Returns { context, sources } or { context: '', sources: [] } on error or empty KB.
 * @param {string} queryText - User message to embed.
 * @param {string} apiKey - OpenAI API key.
 * @returns {Promise<{ context: string, sources: string[] }>}
 */
async function getKbContext(queryText, apiKey) {
  if (!queryText || !apiKey) {
    return { context: '', sources: [] };
  }
  try {
    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey });
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: queryText.slice(0, 8000),
    });
    const embedding = embRes?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return { context: '', sources: [] };
    }
    const vecStr = `[${embedding.join(',')}]`;
    const result = await query(
      `SELECT content, source FROM support_kb_chunks
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vecStr, RAG_TOP_K]
    );
    if (!result.rows.length) {
      return { context: '', sources: [] };
    }
    const context = result.rows
      .map((r, i) => `[${i + 1}] ${(r.content || '').trim()}`)
      .join('\n\n');
    const sources = [...new Set(result.rows.map(r => r.source).filter(Boolean))];
    return { context, sources };
  } catch (err) {
    logger.warn('Support RAG getKbContext failed', { error: err.message });
    return { context: '', sources: [] };
  }
}

/**
 * Persist chat turn to support_chat_conversations + support_chat_messages (if migration 048 applied).
 * Returns conversationId for the client to send on next message.
 * @param {Object} opts - { conversationId, userMessage, assistantReply, userId, tenantId, shopDomain }
 * @returns {Promise<string|null>} conversation_id or null
 */
async function persistChatTurn(opts) {
  const {
    conversationId: existingId,
    userMessage,
    assistantReply,
    userId,
    tenantId,
    shopDomain,
  } = opts || {};
  if (!userMessage || !assistantReply) {
    return existingId || null;
  }
  try {
    let convId =
      existingId && UUID_REGEX.test(String(existingId).trim()) ? String(existingId).trim() : null;
    const check = convId
      ? await query('SELECT id FROM support_chat_conversations WHERE id = $1', [convId])
      : { rows: [] };
    if (!check.rows.length) {
      const insertConv = await query(
        `INSERT INTO support_chat_conversations (user_id, tenant_id, shop_domain, source)
         VALUES ($1, $2, $3, 'support_page')
         RETURNING id`,
        [userId || null, tenantId || null, shopDomain || null]
      );
      convId = insertConv.rows[0]?.id ?? null;
    }
    if (!convId) {
      return existingId || null;
    }
    await query(
      "INSERT INTO support_chat_messages (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)",
      [convId, userMessage.slice(0, 50000), assistantReply.slice(0, 50000)]
    );
    return convId;
  } catch (err) {
    logger.warn('Support chat persist failed (tables may not exist)', { error: err.message });
    return existingId || null;
  }
}

/**
 * Build OpenAI messages from optional history + current user message.
 * @param {string} currentMessage - Current user message (required).
 * @param {Array<{role: string, content: string}>} [history] - Optional prior messages (user/assistant).
 * @param {string} [systemPrompt] - Optional system prompt (e.g. RAG context).
 * @returns {Array<{role: string, content: string}>}
 */
function buildChatMessages(currentMessage, history, systemPrompt) {
  const out = [{ role: 'system', content: systemPrompt || CHAT_SYSTEM_PROMPT }];
  if (Array.isArray(history) && history.length > 0) {
    const trimmed = history.slice(-CHAT_MAX_HISTORY);
    for (const m of trimmed) {
      const role = m?.role === 'assistant' ? 'assistant' : 'user';
      let content = typeof m?.content === 'string' ? m.content.trim() : '';
      if (content.length > CHAT_MAX_MESSAGE_LENGTH) {
        content = content.slice(0, CHAT_MAX_MESSAGE_LENGTH);
      }
      if (content) {
        out.push({ role, content });
      }
    }
  }
  out.push({ role: 'user', content: currentMessage });
  return out;
}

/**
 * POST /api/support/chat
 * AI chatbot: returns a stub when OPENAI_API_KEY is not set; otherwise calls OpenAI.
 * Body: { message: string, messages?: Array<{role, content}> } (messages = conversation history for context).
 * Auth optional. Rate limit: RATE_LIMIT_SUPPORT_CHAT_MAX per window (default 40). Max tokens: OPENAI_CHAT_MAX_TOKENS (default 500).
 */
router.post(
  '/chat',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const raw = typeof body.message === 'string' ? body.message.trim() : '';
    const history = Array.isArray(body.messages) ? body.messages.slice(0, 20) : [];
    const conversationId =
      body.conversation_id && typeof body.conversation_id === 'string'
        ? body.conversation_id.trim()
        : null;
    if (!raw) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    if (raw.length > CHAT_MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Message must be ${CHAT_MAX_MESSAGE_LENGTH} characters or less`,
      });
    }

    const userId = req.userId || null;
    const tenantId = req.tenantId || null;
    const shopDomain = req.shopDomain && typeof req.shopDomain === 'string' ? req.shopDomain : null;

    const apiKey = process.env.OPENAI_API_KEY;
    let reply;
    if (!apiKey) {
      reply =
        "The AI assistant isn't configured yet. Please use the **Contact us** form to get help. We typically reply within 24 hours.";
      const convId = await persistChatTurn({
        conversationId,
        userMessage: raw,
        assistantReply: reply,
        userId,
        tenantId,
        shopDomain,
      });
      return res.json({
        success: true,
        reply,
        sources: [],
        conversation_id: convId || undefined,
      });
    }

    const { context: kbContext, sources: kbSources } = await getKbContext(raw, apiKey);
    const systemPrompt = kbContext ? CHAT_SYSTEM_PROMPT_RAG(kbContext) : null;
    const openaiMessages = buildChatMessages(raw, history, systemPrompt);

    try {
      const OpenAI = require('openai').default;
      const openai = new OpenAI({ apiKey });
      const maxTokens = Math.min(
        Math.max(parseInt(process.env.OPENAI_CHAT_MAX_TOKENS, 10) || 500, 100),
        1000
      );
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        messages: openaiMessages,
        max_tokens: maxTokens,
        temperature: 0.3,
      });
      reply =
        completion.choices?.[0]?.message?.content?.trim() ||
        "I couldn't generate a reply. Please try the contact form.";
    } catch (err) {
      logger.warn('Support chat OpenAI error', { error: err.message });
      reply =
        "I'm having trouble right now. Please use the **Contact us** form and we'll help you directly.";
    }

    const convId = await persistChatTurn({
      conversationId,
      userMessage: raw,
      assistantReply: reply,
      userId,
      tenantId,
      shopDomain,
    });

    return res.json({
      success: true,
      reply,
      sources: kbSources || [],
      conversation_id: convId || undefined,
    });
  })
);

module.exports = router;
