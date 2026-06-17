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
const { syncSupportTicketToExternalInbox } = require('../services/supportInboxIntegrationService');
const { retrieveSupportKbContext } = require('../services/supportAiRagService');
const { FAQ_ALL_CATEGORY, buildFaqSuggestions } = require('../services/supportFaqService');
const { redactText } = require('../services/supportAgentRedactionService');
const {
  SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH,
  getSupportTicketForUser,
  listSupportTicketThreadMessages,
  markSupportTicketThreadRead,
  createSupportTicketThreadMessage,
  subscribeSupportTicketThread,
} = require('../services/supportTicketThreadService');

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
const FEATURE_REQUEST_TITLE_MAX_LENGTH = 180;
const FEATURE_REQUEST_DETAILS_MAX_LENGTH = 5000;
const FEATURE_REQUESTS_LIST_LIMIT = 100;
const FEATURE_REQUEST_STATUSES = [
  'open',
  'planned',
  'in_progress',
  'shipped',
  'closed',
  'rejected',
];
const SUPPORT_STATUS_KV_KEY = 'support.status.current';
const SUPPORT_STATUS_VALUES = ['operational', 'degraded', 'outage', 'maintenance'];
const SUPPORT_CHANGELOG_LIST_LIMIT = 50;
const SUPPORT_CONTEXT_HELP_MAX_ITEMS = 5;
const SUPPORT_AUTO_CATEGORY_ENABLED =
  String(process.env.SUPPORT_AUTO_CATEGORY_ENABLED || 'true')
    .trim()
    .toLowerCase() !== 'false';
const SUPPORT_AUTO_CATEGORY_MIN_SCORE = Math.max(
  parseInt(process.env.SUPPORT_AUTO_CATEGORY_MIN_SCORE, 10) || 2,
  1
);
const SUPPORT_CATEGORY_KEYWORDS = {
  technical: [
    'error',
    'bug',
    'broken',
    'not working',
    'issue',
    'fails',
    'failure',
    'exception',
    'timeout',
    '500',
    '404',
    'cart transform',
    'checkout',
    'script',
  ],
  billing: [
    'billing',
    'invoice',
    'charge',
    'charged',
    'payment',
    'refund',
    'plan',
    'subscription',
    'credit card',
    'price',
    'cost',
  ],
  feature_request: [
    'feature',
    'request',
    'would like',
    'please add',
    'idea',
    'roadmap',
    'enhancement',
    'improvement',
    'wishlist',
  ],
  script_install: [
    'install',
    'setup',
    'snippet',
    'theme app extension',
    'app embed',
    'liquid',
    'theme',
    'onboarding',
    'how to',
    'configure',
  ],
};

function getFeatureRequestVoterKey(req) {
  if (req?.userId) {
    return `user:${String(req.userId).trim().toLowerCase()}`;
  }
  if (req?.email) {
    return `email:${String(req.email).trim().toLowerCase()}`;
  }
  if (req?.shopDomain) {
    return `shop:${String(req.shopDomain).trim().toLowerCase()}`;
  }
  return null;
}

function normalizePublicSupportStatusValue(rawValue) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase();
  if (SUPPORT_STATUS_VALUES.includes(normalized)) {
    return normalized;
  }
  return 'operational';
}

function parsePublicSupportStatus(rawValue) {
  const fallback = {
    status: 'operational',
    message: 'All systems operational',
    updated_at: null,
  };
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(rawValue);
    const message = typeof parsed?.message === 'string' ? parsed.message.trim() : '';
    return {
      status: normalizePublicSupportStatusValue(parsed?.status),
      message: message || fallback.message,
      updated_at: parsed?.updated_at || null,
    };
  } catch (_err) {
    return fallback;
  }
}

function parseJsonObject(value) {
  if (value && typeof value === 'object') {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

function classifySupportCategory(subject, message) {
  const combined = `${String(subject || '')}\n${String(message || '')}`.toLowerCase();
  const normalized = combined.replace(/\s+/g, ' ').trim();
  const categories = ['technical', 'billing', 'feature_request', 'script_install'];
  const scores = {};
  const matches = {};
  categories.forEach(category => {
    const keywords = SUPPORT_CATEGORY_KEYWORDS[category] || [];
    let score = 0;
    const matched = [];
    keywords.forEach(keyword => {
      if (keyword && normalized.includes(keyword)) {
        score += keyword.includes(' ') ? 2 : 1;
        matched.push(keyword);
      }
    });
    scores[category] = score;
    matches[category] = matched;
  });

  const ranked = categories
    .map(category => ({
      category,
      score: scores[category] || 0,
      matches: matches[category] || [],
    }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0] || { category: 'other', score: 0, matches: [] };
  if (best.score < SUPPORT_AUTO_CATEGORY_MIN_SCORE) {
    return {
      category: 'other',
      source: 'manual_other',
      score: best.score || 0,
      matches: [],
      ranked,
    };
  }
  return {
    category: best.category,
    source: 'auto',
    score: best.score || 0,
    matches: best.matches || [],
    ranked,
  };
}

function normalizeContextPathname(rawPathname) {
  const trimmed = String(rawPathname || '').trim();
  if (!trimmed) {
    return '';
  }
  const withoutHash = trimmed.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return normalized.replace(/\/+$/, '') || '/';
}

function inferContextKeyFromPath(pathname) {
  const p = normalizeContextPathname(pathname).toLowerCase();
  if (!p || p === '/') {
    return 'general';
  }
  if (p.startsWith('/app/')) {
    if (p.includes('/setup')) {
      return 'setup_wizard';
    }
    if (p.includes('/settings')) {
      return 'app_settings';
    }
    if (p.includes('/tests/create')) {
      return 'test_create';
    }
    if (p.includes('/tests/')) {
      return 'test_detail';
    }
    if (p.includes('/analytics')) {
      return 'analytics';
    }
  }
  if (p.startsWith('/support')) {
    return 'support';
  }
  if (p.startsWith('/documentation')) {
    return 'documentation';
  }
  if (p.startsWith('/admin')) {
    return 'admin';
  }
  return 'general';
}

function buildAppScopedPath(appDomain, suffix) {
  const domain = String(appDomain || '').trim();
  if (!domain) {
    return null;
  }
  return `/app/${domain}${suffix}`;
}

function buildContextualHelpPayload({ contextKey, appDomain }) {
  const docsPath = '/documentation';
  const supportPath = '/support';
  const settingsPath = buildAppScopedPath(appDomain, '/settings');
  const setupPath = buildAppScopedPath(appDomain, '/setup');
  const createTestPath = buildAppScopedPath(appDomain, '/tests/create');
  const analyticsPath = buildAppScopedPath(appDomain, '/analytics');

  const helpByContext = {
    setup_wizard: {
      title: 'Setup guidance for this step',
      suggestions: [
        {
          id: 'setup_docs',
          title: 'Open setup docs',
          description: 'Follow the guided setup checklist and required Shopify steps.',
          path: docsPath,
        },
        {
          id: 'setup_settings',
          title: 'Open app settings',
          description: 'Review function diagnostics and connection status.',
          path: settingsPath,
        },
        {
          id: 'setup_support',
          title: 'Contact support',
          description: 'Escalate setup blockers with screenshots and store domain.',
          path: supportPath,
        },
      ],
    },
    app_settings: {
      title: 'Settings help for this page',
      suggestions: [
        {
          id: 'settings_docs',
          title: 'Read settings docs',
          description: 'Understand each settings section and safe defaults.',
          path: docsPath,
        },
        {
          id: 'settings_setup',
          title: 'Go to guided setup',
          description: 'Use setup wizard when diagnostics show missing steps.',
          path: setupPath,
        },
        {
          id: 'settings_support',
          title: 'Ask support',
          description: 'Share diagnostics output for faster troubleshooting.',
          path: supportPath,
        },
      ],
    },
    test_create: {
      title: 'Create-test tips',
      suggestions: [
        {
          id: 'create_test_docs',
          title: 'View test creation docs',
          description: 'Targeting, variants, and guardrails best practices.',
          path: docsPath,
        },
        {
          id: 'create_test_analytics',
          title: 'Open analytics',
          description: 'Check prior results before launching a new experiment.',
          path: analyticsPath,
        },
        {
          id: 'create_test_support',
          title: 'Need help reviewing setup?',
          description: 'Support can validate targeting and price config.',
          path: supportPath,
        },
      ],
    },
    test_detail: {
      title: 'Analyze and troubleshoot this test',
      suggestions: [
        {
          id: 'test_detail_docs',
          title: 'Read result interpretation guide',
          description: 'Understand significance and confidence before rollout.',
          path: docsPath,
        },
        {
          id: 'test_detail_new',
          title: 'Create follow-up test',
          description: 'Start the next iteration with refined targeting.',
          path: createTestPath,
        },
        {
          id: 'test_detail_support',
          title: 'Report an issue',
          description: 'Escalate data mismatches or checkout behavior.',
          path: supportPath,
        },
      ],
    },
    analytics: {
      title: 'Analytics help',
      suggestions: [
        {
          id: 'analytics_docs',
          title: 'Open analytics documentation',
          description: 'Metric definitions, attribution, and caveats.',
          path: docsPath,
        },
        {
          id: 'analytics_support',
          title: 'Ask support about a metric',
          description: 'Get help when numbers look inconsistent.',
          path: supportPath,
        },
      ],
    },
    documentation: {
      title: 'Documentation shortcuts',
      suggestions: [
        {
          id: 'docs_support',
          title: 'Go to support',
          description: 'Open a ticket when docs do not resolve your case.',
          path: supportPath,
        },
        {
          id: 'docs_setup',
          title: 'Open setup wizard',
          description: 'Apply the guide directly in-app.',
          path: setupPath,
        },
      ],
    },
    support: {
      title: 'Support options',
      suggestions: [
        {
          id: 'support_contact',
          title: 'Contact support',
          description: 'Create a support request with issue details.',
          path: supportPath,
        },
        {
          id: 'support_docs',
          title: 'Search docs first',
          description: 'Find implementation examples and troubleshooting steps.',
          path: docsPath,
        },
      ],
    },
    admin: {
      title: 'Admin support workflow',
      suggestions: [
        {
          id: 'admin_inbox',
          title: 'Review unified inbox',
          description: 'Triage tickets, feature requests, and chat feedback.',
          path: '/admin?tab=support',
        },
        {
          id: 'admin_changelog',
          title: 'Publish status update',
          description: 'Use status/changelog for incident communication.',
          path: '/admin?tab=support',
        },
      ],
    },
    general: {
      title: 'Quick help for this page',
      suggestions: [
        {
          id: 'general_docs',
          title: 'Open documentation',
          description: 'Browse setup guides and implementation references.',
          path: docsPath,
        },
        {
          id: 'general_support',
          title: 'Open support',
          description: 'Ask a question or escalate a blocking issue.',
          path: supportPath,
        },
      ],
    },
  };

  const selected = helpByContext[contextKey] || helpByContext.general;
  const suggestions = (selected.suggestions || [])
    .filter(item => item && (item.path || item.url))
    .slice(0, SUPPORT_CONTEXT_HELP_MAX_ITEMS);

  return {
    context_key: contextKey,
    title: selected.title || helpByContext.general.title,
    suggestions,
  };
}

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
 * GET /api/support/contextual-help
 * Returns context-aware support/documentation shortcuts for current app route.
 */
router.get(
  '/contextual-help',
  optionalAuthenticate,
  asyncHandler((req, res) => {
    const pathname =
      req.query.pathname ||
      req.query.path ||
      req.query.current_pathname ||
      req.get('x-ripx-pathname') ||
      '/';
    const normalizedPathname = normalizeContextPathname(pathname);
    const explicitAppDomain = String(req.query.app_domain || '').trim();
    const inferredDomainMatch = normalizedPathname.match(/^\/app\/([^/]+)/i);
    const inferredAppDomain =
      inferredDomainMatch && inferredDomainMatch[1] ? inferredDomainMatch[1].trim() : '';
    const appDomain = explicitAppDomain || inferredAppDomain || '';
    const contextKey = inferContextKeyFromPath(normalizedPathname);
    const payload = buildContextualHelpPayload({
      contextKey,
      appDomain,
    });
    return res.json({
      success: true,
      pathname: normalizedPathname || '/',
      app_domain: appDomain || null,
      ...payload,
    });
  })
);

/**
 * GET /api/support/faq-suggestions
 * Returns page-aware FAQ cards with an optional knowledge-base fallback signal.
 */
router.get(
  '/faq-suggestions',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const pathname = normalizeContextPathname(
      req.query.pathname || req.query.path || req.get('x-ripx-pathname') || '/'
    );
    const q = String(req.query.q || req.query.query || '')
      .trim()
      .slice(0, 240);
    const category = String(req.query.category || FAQ_ALL_CATEGORY).trim() || FAQ_ALL_CATEGORY;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 3, 8));
    const payload = await buildFaqSuggestions({
      pathname,
      query: q,
      category,
      limit,
      retrieveKbContext: retrieveSupportKbContext,
    });

    return res.json({
      success: true,
      pathname,
      query: q,
      category,
      ...payload,
    });
  })
);

/**
 * POST /api/support/faq-feedback
 * Captures lightweight usefulness signals for FAQ answers.
 */
router.post(
  '/faq-feedback',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const faqId = String(req.body?.faq_id || '')
      .trim()
      .slice(0, 80);
    if (!faqId) {
      return res.status(400).json({ success: false, error: 'faq_id is required' });
    }
    const helpful = Boolean(req.body?.helpful);
    const category = String(req.body?.category || '')
      .trim()
      .slice(0, 80);
    const reason =
      String(req.body?.reason || '')
        .trim()
        .slice(0, 160) || null;
    const routeContext =
      req.body?.route_context && typeof req.body.route_context === 'object'
        ? req.body.route_context
        : {};
    const searchQuery = String(req.body?.search_query || '')
      .trim()
      .slice(0, 240);

    await auditLogService.log('__support__', {
      entityType: 'support_faq',
      entityId: faqId,
      action: helpful ? 'faq_helpful' : 'faq_still_need_help',
      userId: req.user?.id || req.shopDomain || null,
      actorType: req.user?.id ? 'user' : 'anonymous',
      actorId: req.user?.id || req.shopDomain || req.ip || 'anonymous',
      ipAddress: req.ip || req.connection?.remoteAddress,
      changes: {
        faq_id: faqId,
        category,
        helpful,
        reason,
        route_context: routeContext,
        search_query: searchQuery,
      },
    });

    return res.json({ success: true });
  })
);

/**
 * GET /api/support/status
 * Public support status card data.
 */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const result = await query('SELECT value, updated_at FROM key_value_store WHERE key = $1', [
      SUPPORT_STATUS_KV_KEY,
    ]).catch(() => ({ rows: [] }));
    const row = result.rows?.[0];
    const payload = parsePublicSupportStatus(row?.value || '');
    return res.json({
      success: true,
      status: payload.status,
      message: payload.message,
      updated_at: payload.updated_at || row?.updated_at || null,
    });
  })
);

/**
 * GET /api/support/changelog
 * Public changelog feed (published entries only).
 */
router.get(
  '/changelog',
  asyncHandler(async (req, res) => {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      SUPPORT_CHANGELOG_LIST_LIMIT
    );
    const withDeletedSql = `
      SELECT id, title, summary, body, level, visibility, published_at, created_at, updated_at
      FROM support_changelog_entries
      WHERE visibility = 'published'
        AND (deleted_at IS NULL)
      ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
      LIMIT $1
    `;
    const noDeletedSql = `
      SELECT id, title, summary, body, level, visibility, published_at, created_at, updated_at
      FROM support_changelog_entries
      WHERE visibility = 'published'
      ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
      LIMIT $1
    `;
    let rows = [];
    try {
      const result = await query(withDeletedSql, [limit]);
      rows = result.rows || [];
    } catch (err) {
      if (
        err.message &&
        (/deleted_at|column.*does not exist/i.test(err.message) ||
          /support_changelog_entries|relation .* does not exist/i.test(err.message))
      ) {
        const result = await query(noDeletedSql, [limit]).catch(() => ({ rows: [] }));
        rows = result.rows || [];
      } else {
        throw err;
      }
    }

    return res.json({
      success: true,
      changelog: rows.map(row => ({
        id: row.id,
        title: row.title,
        summary: row.summary || '',
        body: row.body || '',
        level: row.level || 'info',
        published_at: row.published_at || row.created_at || null,
        updated_at: row.updated_at || null,
      })),
    });
  })
);

/**
 * GET /api/support/feature-requests
 * Public board list for feature request voting.
 */
router.get(
  '/feature-requests',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const rawStatus =
      typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
    const status = FEATURE_REQUEST_STATUSES.includes(rawStatus) ? rawStatus : '';
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 30, 1),
      FEATURE_REQUESTS_LIST_LIMIT
    );
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const voterKey = getFeatureRequestVoterKey(req);

    const withDeletedBase = `
      SELECT fr.id, fr.title, fr.details, fr.status, fr.vote_count, fr.created_at, fr.updated_at,
             COALESCE(v.value, 0)::int AS my_vote
      FROM support_feature_requests fr
      LEFT JOIN support_feature_request_votes v
        ON v.request_id = fr.id
        AND v.voter_key = $3
      WHERE (fr.deleted_at IS NULL)
    `;
    const noDeletedBase = `
      SELECT fr.id, fr.title, fr.details, fr.status, fr.vote_count, fr.created_at, fr.updated_at,
             COALESCE(v.value, 0)::int AS my_vote
      FROM support_feature_requests fr
      LEFT JOIN support_feature_request_votes v
        ON v.request_id = fr.id
        AND v.voter_key = $3
      WHERE 1=1
    `;
    const orderAndPage = `
      ORDER BY fr.vote_count DESC, fr.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const statusFilter = status ? ' AND fr.status = $4' : '';
    const params = status
      ? [limit, offset, voterKey || '__anon__', status]
      : [limit, offset, voterKey || '__anon__'];

    let rows = [];
    try {
      const result = await query(withDeletedBase + statusFilter + orderAndPage, params);
      rows = result.rows || [];
    } catch (err) {
      if (
        err.message &&
        (/deleted_at|column.*does not exist/i.test(err.message) ||
          /support_feature_requests|support_feature_request_votes|relation .* does not exist/i.test(
            err.message
          ))
      ) {
        const result = await query(noDeletedBase + statusFilter + orderAndPage, params).catch(
          () => ({
            rows: [],
          })
        );
        rows = result.rows || [];
      } else {
        throw err;
      }
    }

    return res.json({
      success: true,
      feature_requests: rows.map(row => ({
        id: row.id,
        title: row.title,
        details: row.details || '',
        status: row.status,
        vote_count: Number(row.vote_count) || 0,
        my_vote: Number(row.my_vote) || 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    });
  })
);

/**
 * POST /api/support/feature-requests
 * Create feature request (authenticated users).
 */
router.post(
  '/feature-requests',
  authenticate,
  asyncHandler(async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (title.length > FEATURE_REQUEST_TITLE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `title must be ${FEATURE_REQUEST_TITLE_MAX_LENGTH} characters or less`,
      });
    }
    if (details.length > FEATURE_REQUEST_DETAILS_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `details must be ${FEATURE_REQUEST_DETAILS_MAX_LENGTH} characters or less`,
      });
    }
    const category =
      typeof req.body?.category === 'string' &&
      req.body.category.trim().toLowerCase() === 'feature_request'
        ? 'feature_request'
        : 'feature_request';
    const userId = req.userId || null;
    const tenantId = req.tenantId || null;
    const shopDomain = req.shopDomain || null;
    const email = req.email || null;

    const insertSql = `
      INSERT INTO support_feature_requests
        (user_id, tenant_id, shop_domain, email, title, details, status, vote_count, metadata)
      VALUES
        ($1, $2, $3, $4, $5, $6, 'open', 0, $7::jsonb)
      RETURNING id, title, details, status, vote_count, created_at, updated_at
    `;
    const metadata = JSON.stringify({ category, source: 'support_page' });
    let row = null;
    try {
      const result = await query(insertSql, [
        userId,
        tenantId,
        shopDomain,
        email,
        title,
        details,
        metadata,
      ]);
      row = result.rows?.[0] || null;
    } catch (err) {
      if (/support_feature_requests|relation .* does not exist/i.test(err.message || '')) {
        return res.status(503).json({
          success: false,
          error: 'Feature request board is not initialized yet (missing migration).',
        });
      }
      throw err;
    }

    return res.status(201).json({
      success: true,
      feature_request: {
        id: row.id,
        title: row.title,
        details: row.details || '',
        status: row.status,
        vote_count: Number(row.vote_count) || 0,
        my_vote: 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  })
);

/**
 * POST /api/support/feature-requests/:id/vote
 * Vote (+1 / -1, toggle if same vote repeated).
 */
router.post(
  '/feature-requests/:id/vote',
  authenticate,
  asyncHandler(async (req, res) => {
    const requestId = req.params.id;
    if (!requestId || !UUID_REGEX.test(String(requestId).trim())) {
      return res.status(400).json({ success: false, error: 'Invalid feature request id' });
    }
    const rawValue = Number(req.body?.value);
    const value = rawValue === -1 ? -1 : 1;
    const voterKey = getFeatureRequestVoterKey(req);
    if (!voterKey) {
      return res.status(400).json({ success: false, error: 'Could not determine voter identity' });
    }

    let myVote = value;
    try {
      const existing = await query(
        `SELECT value
         FROM support_feature_request_votes
         WHERE request_id = $1::uuid
           AND voter_key = $2
         LIMIT 1`,
        [requestId, voterKey]
      );
      const existingValue = Number(existing.rows?.[0]?.value) || 0;
      if (existingValue === value) {
        await query(
          `DELETE FROM support_feature_request_votes
           WHERE request_id = $1::uuid
             AND voter_key = $2`,
          [requestId, voterKey]
        );
        myVote = 0;
      } else if (existingValue === 0) {
        await query(
          `INSERT INTO support_feature_request_votes
            (request_id, user_id, voter_key, value)
           VALUES
            ($1::uuid, $2, $3, $4)`,
          [requestId, req.userId || null, voterKey, value]
        );
        myVote = value;
      } else {
        await query(
          `UPDATE support_feature_request_votes
           SET value = $3, updated_at = NOW()
           WHERE request_id = $1::uuid
             AND voter_key = $2`,
          [requestId, voterKey, value]
        );
        myVote = value;
      }

      const voteResult = await query(
        `SELECT COALESCE(SUM(value), 0)::int AS vote_count
         FROM support_feature_request_votes
         WHERE request_id = $1::uuid`,
        [requestId]
      );
      const voteCount = Number(voteResult.rows?.[0]?.vote_count) || 0;

      const updated = await query(
        `UPDATE support_feature_requests
         SET vote_count = $2, updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING id, vote_count, status`,
        [requestId, voteCount]
      );
      if (!updated.rows?.length) {
        return res.status(404).json({ success: false, error: 'Feature request not found' });
      }
      return res.json({
        success: true,
        feature_request: {
          id: updated.rows[0].id,
          vote_count: Number(updated.rows[0].vote_count) || 0,
          status: updated.rows[0].status,
          my_vote: myVote,
        },
      });
    } catch (err) {
      if (
        /support_feature_request_votes|support_feature_requests|relation .* does not exist/i.test(
          err.message || ''
        )
      ) {
        return res.status(503).json({
          success: false,
          error: 'Feature request board is not initialized yet (missing migration).',
        });
      }
      throw err;
    }
  })
);

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
    const hasValidProvidedCategory = rawCategory && CATEGORIES.includes(rawCategory);
    const shouldTryAutoCategory =
      SUPPORT_AUTO_CATEGORY_ENABLED && (!hasValidProvidedCategory || rawCategory === 'other');
    const classification = shouldTryAutoCategory
      ? classifySupportCategory(rawSubject, rawMessage)
      : null;
    const categoryVal =
      hasValidProvidedCategory && rawCategory !== 'other'
        ? rawCategory
        : classification?.category || 'other';
    const categorySource =
      hasValidProvidedCategory && rawCategory !== 'other'
        ? 'manual'
        : classification?.source || 'manual_other';

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

    const ticketMetadata = {
      source: 'support_page',
      provided_category: hasValidProvidedCategory ? rawCategory : null,
      category_source: categorySource,
      auto_category: categorySource === 'auto',
      classifier_version: 'keyword-v1',
      classifier_score: classification?.score || 0,
      classifier_matches: Array.isArray(classification?.matches) ? classification.matches : [],
      classifier_candidates: Array.isArray(classification?.ranked)
        ? classification.ranked.map(item => ({
            category: item.category,
            score: item.score,
          }))
        : [],
    };
    let result;
    try {
      result = await query(
        `INSERT INTO support_tickets
           (user_id, email, subject, category, message, tenant_id, shop_domain, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING id, created_at`,
        [
          userId,
          rawEmail,
          rawSubject,
          categoryVal,
          rawMessage,
          tenantId,
          shopDomain,
          JSON.stringify(ticketMetadata),
        ]
      );
    } catch (insertErr) {
      if (insertErr.message && /metadata|column.*does not exist/i.test(insertErr.message)) {
        result = await query(
          `INSERT INTO support_tickets (user_id, email, subject, category, message, tenant_id, shop_domain)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
          [userId, rawEmail, rawSubject, categoryVal, rawMessage, tenantId, shopDomain]
        );
      } else {
        throw insertErr;
      }
    }
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
        <p>Category: ${escapeHtml(categoryVal)}${
          categorySource === 'auto' ? ' (auto-classified)' : ''
        }</p>
        <p>Subject: ${safeSubject}</p>
        ${tenantId ? `<p>Tenant ID: ${escapeHtml(String(tenantId))}</p>` : ''}
        ${shopDomain ? `<p>Shop: ${escapeHtml(shopDomain)}</p>` : ''}
        <div class="divider"></div>
        <p>${safeMessage}</p>
      `;
        const toSupportText = `New support request #${ticketIdShort}\nFrom: ${rawEmail}\nCategory: ${categoryVal}${categorySource === 'auto' ? ' (auto-classified)' : ''}\nSubject: ${rawSubject}\n\n${rawMessage}`;
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
      categorySource,
    });

    try {
      auditLogService.log(req.shopDomain || '__support__', {
        entityType: 'support_ticket',
        entityId: String(ticketId),
        action: 'created',
        userId: userId || null,
        changes: {
          category: categoryVal,
          category_source: categorySource,
          subjectLength: rawSubject.length,
        },
      });
    } catch (auditErr) {
      logger.warn('Support ticket audit log failed', { ticketId, error: auditErr?.message });
    }

    try {
      const inboxSyncResult = await syncSupportTicketToExternalInbox({
        id: ticketId,
        email: rawEmail,
        subject: rawSubject,
        category: categoryVal,
        message: rawMessage,
        shopDomain,
      });
      if (!inboxSyncResult?.ok && !inboxSyncResult?.skipped) {
        logger.warn('Support ticket external inbox sync failed', {
          ticketId,
          provider: inboxSyncResult?.provider || null,
          status: inboxSyncResult?.status || null,
          error: inboxSyncResult?.error || null,
        });
      }
    } catch (inboxSyncErr) {
      logger.warn('Support ticket external inbox sync exception', {
        ticketId,
        error: inboxSyncErr?.message,
      });
    }

    return res.status(201).json({
      success: true,
      ticket_id: ticketId,
      category: categoryVal,
      category_source: categorySource,
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
    const baseWhereEmail = 'WHERE LOWER(st.email) = LOWER($1)';
    const baseWhereShop = 'WHERE LOWER(st.shop_domain) = LOWER($1)';
    const deletedFilter = ' AND (st.deleted_at IS NULL)';
    const orderLimit = ' ORDER BY st.updated_at DESC, st.created_at DESC LIMIT $2';
    const selectCols = `
      SELECT st.id, st.subject, st.category, st.status, st.created_at, st.updated_at, st.metadata,
             msg.latest_admin_reply_at,
             rs.last_read_at AS user_last_read_at,
             (
               SELECT COUNT(*)::int
               FROM support_ticket_messages unread_msg
               WHERE unread_msg.ticket_id = st.id
                 AND unread_msg.sender_type = 'admin'
                 AND (rs.last_read_at IS NULL OR unread_msg.created_at > rs.last_read_at)
             ) AS unread_count
      FROM support_tickets st
      LEFT JOIN (
        SELECT ticket_id,
          MAX(created_at) FILTER (WHERE sender_type = 'admin') AS latest_admin_reply_at
        FROM support_ticket_messages
        GROUP BY ticket_id
      ) msg ON msg.ticket_id = st.id
      LEFT JOIN support_ticket_read_states rs
        ON rs.ticket_id = st.id AND rs.audience = 'user'
    `;
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
      if (
        err.message &&
        /deleted_at|metadata|support_ticket_read_states|support_ticket_messages|column.*does not exist|relation .* does not exist/i.test(
          err.message
        )
      ) {
        const fallbackSelectCols =
          'SELECT st.id, st.subject, st.category, st.status, st.created_at, st.updated_at FROM support_tickets st ';
        if (byEmail) {
          result = await query(fallbackSelectCols + baseWhereEmail + orderLimit, [
            req.email.trim(),
            TICKETS_LIST_LIMIT,
          ]);
        } else {
          result = await query(fallbackSelectCols + baseWhereShop + orderLimit, [
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
      tickets: result.rows.map(r => {
        const metadata = parseJsonObject(r.metadata);
        return {
          id: r.id,
          subject: r.subject,
          category: r.category,
          category_source:
            typeof metadata?.category_source === 'string' ? metadata.category_source : 'manual',
          status: r.status,
          created_at: r.created_at,
          updated_at: r.updated_at,
          latest_admin_reply_at: r.latest_admin_reply_at || null,
          user_last_read_at: r.user_last_read_at || null,
          unread_count: Number(r.unread_count || 0),
          has_unread_support_reply: Number(r.unread_count || 0) > 0,
        };
      }),
    });
  })
);

/**
 * GET /api/support/tickets/:id/thread
 * Returns the ticket thread for the authenticated user.
 */
router.get(
  '/tickets/:id/thread',
  authenticate,
  asyncHandler(async (req, res) => {
    const ticketId = String(req.params?.id || '').trim();
    if (!ticketId || !UUID_REGEX.test(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket id' });
    }
    const ticket = await getSupportTicketForUser(ticketId, {
      userId: req.userId || null,
      email: req.email || null,
      shopDomain: req.shopDomain || null,
    });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    const messages = await listSupportTicketThreadMessages(ticket, {
      limit: parseInt(req.query.limit, 10) || 200,
    });
    const readState = await markSupportTicketThreadRead(ticket.id, 'user');
    return res.json({
      success: true,
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        category: ticket.category,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
      },
      messages,
      read_state: readState,
    });
  })
);

/**
 * POST /api/support/tickets/:id/thread/reply
 * Add a customer reply to an existing support ticket thread.
 */
router.post(
  '/tickets/:id/thread/reply',
  authenticate,
  asyncHandler(async (req, res) => {
    const ticketId = String(req.params?.id || '').trim();
    if (!ticketId || !UUID_REGEX.test(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket id' });
    }
    const ticket = await getSupportTicketForUser(ticketId, {
      userId: req.userId || null,
      email: req.email || null,
      shopDomain: req.shopDomain || null,
    });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    if (message.length > SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `message must be ${SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH} characters or less`,
      });
    }

    const senderLabel =
      (typeof req.email === 'string' && req.email.trim()) ||
      (typeof ticket.email === 'string' && ticket.email.trim()) ||
      (typeof req.shopDomain === 'string' && req.shopDomain.trim()) ||
      'Customer';
    const created = await createSupportTicketThreadMessage({
      ticketId: ticket.id,
      senderType: 'user',
      senderLabel,
      message,
      metadata: {
        source: 'support_portal',
        user_id: req.userId || null,
      },
    });
    if (!created.ok) {
      return res
        .status(400)
        .json({ success: false, error: created.error || 'Could not add reply' });
    }
    const readState = await markSupportTicketThreadRead(ticket.id, 'user');

    auditLogService
      .log(req.shopDomain || '__support__', {
        entityType: 'support_ticket',
        entityId: String(ticket.id),
        action: 'customer_reply',
        userId: req.userId || null,
        actorType: req.authType || 'user',
        actorId: req.userId || req.email || req.shopDomain || 'customer',
        ipAddress: req.ip || req.connection?.remoteAddress,
        changes: {
          message_length: message.length,
          source: 'customer_support_chat',
        },
      })
      .catch(() => {});

    if (SUPPORT_EMAIL_TO) {
      emailService
        .sendMail({
          to: SUPPORT_EMAIL_TO,
          subject: `[RipX Support] New reply on #${String(ticket.id).slice(0, 8)}`,
          text: `A customer replied to support ticket #${String(ticket.id).slice(0, 8)}.\n\nSubject: ${ticket.subject || 'Support request'}\nShop: ${ticket.shop_domain || 'n/a'}\n\n${message}`,
        })
        .catch(() => {});
    }

    return res.status(201).json({
      success: true,
      ticket_id: ticket.id,
      message: created.message,
      read_state: readState,
    });
  })
);

/**
 * GET /api/support/tickets/:id/thread/stream
 * Server-sent events stream for real-time ticket thread updates.
 */
router.get(
  '/tickets/:id/thread/stream',
  authenticate,
  asyncHandler(async (req, res) => {
    const ticketId = String(req.params?.id || '').trim();
    if (!ticketId || !UUID_REGEX.test(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket id' });
    }
    const ticket = await getSupportTicketForUser(ticketId, {
      userId: req.userId || null,
      email: req.email || null,
      shopDomain: req.shopDomain || null,
    });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const writeEvent = payload => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (_err) {
        // Ignore write errors; close handler will clean up.
      }
    };
    writeEvent({
      type: 'connected',
      ticket_id: ticket.id,
      timestamp: new Date().toISOString(),
    });

    const unsubscribe = subscribeSupportTicketThread(ticket.id, async messagePayload => {
      if (messagePayload?.sender_type === 'admin') {
        await markSupportTicketThreadRead(ticket.id, 'user').catch(() => {});
      }
      writeEvent({
        type: 'message',
        ticket_id: ticket.id,
        message: messagePayload,
      });
    });
    const heartbeat = setInterval(() => {
      writeEvent({ type: 'heartbeat', timestamp: new Date().toISOString() });
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        res.end();
      } catch (_err) {
        // Ignore stream close issues.
      }
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
const CHAT_FEEDBACK_MAX_REASON_LENGTH = 500;
const SUPPORT_CHAT_DEFAULT_LANGUAGE = 'auto';
const SUPPORT_CHAT_LANGUAGE_NAMES = {
  auto: 'auto',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  bn: 'Bengali',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Simplified Chinese',
  ar: 'Arabic',
};
const SUPPORT_CHAT_NOT_CONFIGURED_MESSAGE = {
  en: "The AI assistant isn't configured yet. Please use the **Contact us** form to get help. We typically reply within 24 hours.",
  es: 'El asistente de IA aun no esta configurado. Usa el formulario de **Contact us** para recibir ayuda. Normalmente respondemos en 24 horas.',
  fr: "L'assistant IA n'est pas encore configure. Utilisez le formulaire **Contact us** pour obtenir de l'aide. Nous repondons generalement sous 24 heures.",
  de: 'Der KI-Assistent ist noch nicht konfiguriert. Bitte nutze das Formular **Contact us** fur Hilfe. Wir antworten in der Regel innerhalb von 24 Stunden.',
  pt: 'O assistente de IA ainda nao esta configurado. Use o formulario **Contact us** para receber ajuda. Normalmente respondemos em ate 24 horas.',
  it: "L'assistente AI non e ancora configurato. Usa il modulo **Contact us** per ricevere aiuto. Di solito rispondiamo entro 24 ore.",
  nl: 'De AI-assistent is nog niet geconfigureerd. Gebruik het formulier **Contact us** voor hulp. We reageren meestal binnen 24 uur.',
  bn: 'AI সহকারী এখনো কনফিগার করা হয়নি। সাহায্যের জন্য **Contact us** ফর্ম ব্যবহার করুন। আমরা সাধারণত 24 ঘন্টার মধ্যে উত্তর দিই।',
  hi: 'AI सहायक अभी कॉन्फ़िगर नहीं है। मदद के लिए **Contact us** फॉर्म का उपयोग करें। हम आमतौर पर 24 घंटे में जवाब देते हैं।',
  ja: 'AIアシスタントはまだ設定されていません。サポートが必要な場合は **Contact us** フォームをご利用ください。通常24時間以内に返信します。',
  ko: 'AI 도우미가 아직 설정되지 않았습니다. 도움이 필요하면 **Contact us** 양식을 사용하세요. 보통 24시간 이내에 답변드립니다.',
  zh: 'AI 助手尚未配置。请使用 **Contact us** 表单获取帮助。我们通常会在 24 小时内回复。',
  ar: 'مساعد الذكاء الاصطناعي غير مهيأ بعد. يرجى استخدام نموذج **Contact us** للحصول على المساعدة. نرد عادة خلال 24 ساعة.',
};
const SUPPORT_CHAT_TEMPORARY_ISSUE_MESSAGE = {
  en: "I'm having trouble right now. Please use the **Contact us** form and we'll help you directly.",
  es: 'Ahora mismo tengo un problema tecnico. Usa el formulario **Contact us** y te ayudaremos directamente.',
  fr: 'Je rencontre un probleme technique. Utilisez le formulaire **Contact us** et nous vous aiderons directement.',
  de: 'Ich habe gerade ein technisches Problem. Bitte nutze das Formular **Contact us**, dann helfen wir dir direkt weiter.',
  pt: 'Estou com um problema tecnico no momento. Use o formulario **Contact us** e ajudaremos voce diretamente.',
  it: 'Sto avendo un problema tecnico in questo momento. Usa il modulo **Contact us** e ti aiuteremo direttamente.',
  nl: 'Ik heb op dit moment een technisch probleem. Gebruik het formulier **Contact us** en we helpen je direct verder.',
  bn: 'এই মুহূর্তে প্রযুক্তিগত সমস্যায় আছি। **Contact us** ফর্ম ব্যবহার করুন, আমরা সরাসরি সাহায্য করব।',
  hi: 'इस समय तकनीकी समस्या है। कृपया **Contact us** फॉर्म का उपयोग करें, हम सीधे मदद करेंगे।',
  ja: '現在技術的な問題が発生しています。**Contact us** フォームをご利用ください。直接サポートします。',
  ko: '현재 기술적인 문제가 있습니다. **Contact us** 양식을 사용해 주세요. 직접 도와드리겠습니다.',
  zh: '当前出现技术问题。请使用 **Contact us** 表单，我们会直接为你提供帮助。',
  ar: 'أواجه مشكلة تقنية حاليا. يرجى استخدام نموذج **Contact us** وسنساعدك مباشرة.',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSupportChatLanguage(value) {
  if (typeof value !== 'string') {
    return SUPPORT_CHAT_DEFAULT_LANGUAGE;
  }
  const normalized = value.trim().toLowerCase().replace('_', '-');
  if (!normalized) {
    return SUPPORT_CHAT_DEFAULT_LANGUAGE;
  }
  if (normalized === 'auto') {
    return 'auto';
  }
  if (normalized.startsWith('zh')) {
    return 'zh';
  }
  if (normalized.startsWith('pt')) {
    return 'pt';
  }
  const short = normalized.split('-')[0];
  if (Object.prototype.hasOwnProperty.call(SUPPORT_CHAT_LANGUAGE_NAMES, short)) {
    return short;
  }
  return SUPPORT_CHAT_DEFAULT_LANGUAGE;
}

function withSupportLanguageInstruction(basePrompt, language) {
  const lang = normalizeSupportChatLanguage(language);
  if (lang === SUPPORT_CHAT_DEFAULT_LANGUAGE || lang === 'en') {
    return basePrompt;
  }
  const languageLabel = SUPPORT_CHAT_LANGUAGE_NAMES[lang] || 'the user language';
  return `${basePrompt}\n\nLanguage requirement: reply in ${languageLabel}. Keep product names and API paths in their original form.`;
}

function getSupportLanguageMessage(dictionary, language) {
  const lang = normalizeSupportChatLanguage(language);
  return (
    dictionary[lang] ||
    dictionary.en ||
    "The AI assistant isn't configured yet. Please use the **Contact us** form to get help."
  );
}

function parseHelpfulBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'helpful' ||
    normalized === '1'
  ) {
    return true;
  }
  if (
    normalized === 'false' ||
    normalized === 'no' ||
    normalized === 'not_helpful' ||
    normalized === 'not-helpful' ||
    normalized === '0'
  ) {
    return false;
  }
  return null;
}

/**
 * RAG: embed query and fetch top-k chunks from support_kb_chunks. Returns { context, sources } or { context: '', sources: [] } on error or empty KB.
 * @param {string} queryText - User message to embed.
 * @param {string} apiKey - OpenAI API key.
 * @returns {Promise<{ context: string, sources: string[] }>}
 */
async function getKbContext(queryText, apiKey) {
  const result = await retrieveSupportKbContext(queryText, { apiKey, topK: RAG_TOP_K });
  return {
    context: result.context || '',
    sources: result.sources || [],
    status: result.status || 'not_available',
  };
}

/**
 * Persist chat turn to support_chat_conversations + support_chat_messages (if migration 048 applied).
 * Returns conversation + assistant message identifiers for follow-up feedback.
 * @param {Object} opts - { conversationId, userMessage, assistantReply, userId, tenantId, shopDomain }
 * @returns {Promise<{ conversationId: string|null, assistantMessageId: string|null }>}
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
    return {
      conversationId: existingId || null,
      assistantMessageId: null,
    };
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
      return {
        conversationId: existingId || null,
        assistantMessageId: null,
      };
    }

    const insertMessages = await query(
      `INSERT INTO support_chat_messages (conversation_id, role, content)
       VALUES ($1, 'user', $2), ($1, 'assistant', $3)
       RETURNING id, role`,
      [convId, userMessage.slice(0, 50000), assistantReply.slice(0, 50000)]
    );
    const assistantMessageId =
      (insertMessages.rows || []).find(row => row?.role === 'assistant')?.id || null;
    return {
      conversationId: convId,
      assistantMessageId,
    };
  } catch (err) {
    logger.warn('Support chat persist failed (tables may not exist)', { error: err.message });
    return {
      conversationId: existingId || null,
      assistantMessageId: null,
    };
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
    const history = Array.isArray(body.messages)
      ? body.messages.slice(-20).map(message => ({
          ...message,
          content: redactText(message?.content || ''),
        }))
      : [];
    const chatLanguage = normalizeSupportChatLanguage(body.language);
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
    const safeRaw = redactText(raw);
    let reply;
    if (!apiKey) {
      reply = getSupportLanguageMessage(SUPPORT_CHAT_NOT_CONFIGURED_MESSAGE, chatLanguage);
      const persisted = await persistChatTurn({
        conversationId,
        userMessage: safeRaw,
        assistantReply: reply,
        userId,
        tenantId,
        shopDomain,
      });
      return res.json({
        success: true,
        reply,
        sources: [],
        language: chatLanguage,
        conversation_id: persisted.conversationId || undefined,
        assistant_message_id: persisted.assistantMessageId || undefined,
      });
    }

    const {
      context: kbContext,
      sources: kbSources,
      status: ragStatus,
    } = await getKbContext(safeRaw, apiKey);
    const systemPrompt = withSupportLanguageInstruction(
      kbContext ? CHAT_SYSTEM_PROMPT_RAG(kbContext) : CHAT_SYSTEM_PROMPT,
      chatLanguage
    );
    const openaiMessages = buildChatMessages(safeRaw, history, systemPrompt);

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
      reply = getSupportLanguageMessage(SUPPORT_CHAT_TEMPORARY_ISSUE_MESSAGE, chatLanguage);
    }

    const persisted = await persistChatTurn({
      conversationId,
      userMessage: safeRaw,
      assistantReply: reply,
      userId,
      tenantId,
      shopDomain,
    });

    return res.json({
      success: true,
      reply,
      sources: kbSources || [],
      rag_status: ragStatus,
      language: chatLanguage,
      conversation_id: persisted.conversationId || undefined,
      assistant_message_id: persisted.assistantMessageId || undefined,
    });
  })
);

/**
 * POST /api/support/chat-feedback
 * Persist thumbs-up / thumbs-down feedback for AI answers.
 * Body: { conversation_id: UUID, helpful: boolean|string, assistant_message_id?: UUID, reason?: string }
 */
router.post(
  '/chat-feedback',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const conversationId =
      typeof body.conversation_id === 'string' ? body.conversation_id.trim() : '';
    const helpful = parseHelpfulBoolean(body.helpful);
    const assistantMessageId =
      typeof body.assistant_message_id === 'string' ? body.assistant_message_id.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      return res.status(400).json({
        success: false,
        error: 'conversation_id is required and must be a valid UUID',
      });
    }
    if (helpful === null) {
      return res.status(400).json({
        success: false,
        error: 'helpful must be true/false',
      });
    }
    if (assistantMessageId && !UUID_REGEX.test(assistantMessageId)) {
      return res.status(400).json({
        success: false,
        error: 'assistant_message_id must be a valid UUID when provided',
      });
    }
    if (reason.length > CHAT_FEEDBACK_MAX_REASON_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `reason must be ${CHAT_FEEDBACK_MAX_REASON_LENGTH} characters or less`,
      });
    }

    try {
      const existingConversation = await query(
        'SELECT id FROM support_chat_conversations WHERE id = $1',
        [conversationId]
      );
      if (!existingConversation.rows?.length) {
        return res.status(404).json({
          success: false,
          error: 'Conversation not found',
        });
      }

      const feedbackPayload = {
        helpful,
        reason: reason || null,
        assistant_message_id: assistantMessageId || null,
        source: 'support_ui',
        user_id: req.userId || null,
        tenant_id: req.tenantId || null,
      };
      const feedbackContent = helpful ? 'helpful' : 'not_helpful';
      const insertFeedback = await query(
        `INSERT INTO support_chat_messages (conversation_id, role, content, metadata)
         VALUES ($1, 'feedback', $2, $3::jsonb)
         RETURNING id, created_at`,
        [conversationId, feedbackContent, JSON.stringify(feedbackPayload)]
      );

      return res.status(201).json({
        success: true,
        message_id: insertFeedback.rows?.[0]?.id || null,
        created_at: insertFeedback.rows?.[0]?.created_at || null,
      });
    } catch (err) {
      logger.warn('Support chat feedback persist failed', { error: err.message });
      return res.status(500).json({
        success: false,
        error: 'Could not save feedback',
      });
    }
  })
);

module.exports = router;
