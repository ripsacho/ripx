/**
 * RipX - Main Express Application
 *
 * This is the entry point for the RipX backend server.
 * It sets up Express server, middleware, routes, and error handling.
 *
 * @module app
 * @version 1.0.0
 */

// Load .env before any other require that might read process.env (e.g. logger, isProduction).
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

/**
 * CSP / CORS: normalize env URLs to an origin (scheme + host + port only).
 * APP_URL or FRONTEND_URL may include a path (e.g. .../api); browsers expect origins without paths.
 * @param {string|null|undefined} raw
 * @param {string|null} fallback
 * @returns {string|null}
 */
function normalizeOriginFromUrl(raw, fallback = null) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  try {
    const u = new URL(String(raw).trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return fallback;
  }
}

const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const startTime = Date.now();

// Background job processors (Bull): scheduled tests, archive, guardrail, auto-stop, significance alerts, product sync.
// Require REDIS_URL; without it processors fail to start and features that depend on them are disabled.
const isProduction = process.env.NODE_ENV === 'production';
function logProcessorFailure(message, err) {
  const payload = { error: err?.message || err };
  if (isProduction) {
    logger.error(message, payload);
  } else {
    logger.warn(message, payload);
  }
}

try {
  require('./jobs/scheduledTestsProcessor');
  require('./jobs/archiveProcessor');
  try {
    require('./jobs/guardrailProcessor').startGuardrailProcessor();
  } catch (e) {
    logProcessorFailure('Guardrail processor not started', e);
  }
  try {
    require('./jobs/autoStopProcessor').startAutoStopProcessor();
  } catch (e) {
    logProcessorFailure('Auto-stop processor not started', e);
  }
  try {
    require('./jobs/significanceAlertProcessor').startSignificanceAlertProcessor();
  } catch (e) {
    logProcessorFailure('Significance alert processor not started', e);
  }
  try {
    require('./jobs/productSyncProcessor').startProductSyncProcessor();
  } catch (e) {
    logProcessorFailure('Product sync processor not started', e);
  }
} catch (err) {
  logProcessorFailure('Job processors not started (Redis?)', err);
}

let sessionMiddleware = null;
try {
  const session = require('express-session');
  const { createSessionStore, createSessionStoreAsync } = require('./config/sessionStore');
  const redisUrl = process.env.REDIS_URL;
  const useRedisSession = isProduction && redisUrl;

  const sessionSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (isProduction && !process.env.SESSION_SECRET) {
    logger.warn(
      'SESSION_SECRET not set; using JWT_SECRET for session signing. Set SESSION_SECRET in production for better security.'
    );
  }
  const sessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    },
  };

  if (useRedisSession) {
    const sessionStorePromise = createSessionStoreAsync();
    // Do not create sessions until store initialization finishes, otherwise early
    // sessions can land in memory and disappear once middleware is swapped to Redis.
    let cachedSessionMiddleware = null;
    const sessionMiddlewareReady = sessionStorePromise
      .then(store => {
        cachedSessionMiddleware = session({ ...sessionOptions, store: store || undefined });
        return cachedSessionMiddleware;
      })
      .catch(err => {
        logger.error('Session store init failed, using memory fallback', { error: err.message });
        cachedSessionMiddleware = session({ ...sessionOptions, store: undefined });
        return cachedSessionMiddleware;
      });
    sessionMiddleware = (req, res, next) => {
      if (cachedSessionMiddleware) {
        cachedSessionMiddleware(req, res, next);
        return;
      }
      sessionMiddlewareReady.then(mw => mw(req, res, next)).catch(next);
    };
  } else {
    const sessionStore = createSessionStore();
    sessionMiddleware = session({ ...sessionOptions, store: sessionStore || undefined });
  }
} catch (err) {
  if (isProduction) {
    logger.error('express-session not available; using in-memory session fallback', {
      error: err.message,
    });
  } else {
    logger.warn('express-session not available, skipping session middleware', {
      error: err.message,
    });
  }
}
const testRoutes = require('./routes/testRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const shopifyRoutes = require('./routes/shopifyRoutes');
const trackRoutes = require('./routes/trackRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const promoLinkRoutes = require('./routes/promoLinkRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const targetingPresetRoutes = require('./routes/targetingPresetRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const supportRoutes = require('./routes/supportRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const accountRoutes = require('./routes/accountRoutes');
const authRoutes = require('./routes/authRoutes');
const meRoutes = require('./routes/meRoutes');
const { requireEmailSession } = require('./middleware/requireEmailSession');
const adminRoutes = require('./routes/adminRoutes');
const apiDocsRoutes = require('./routes/apiDocsRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { asyncHandler } = require('./middleware/asyncHandler');
const { requestIdMiddleware } = require('./middleware/requestId');
const { authenticate, authenticateShopify } = require('./middleware/auth');
const { RATE_LIMIT, HTTP_STATUS, KV_KEYS } = require('./constants');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Shopify CLI tunnels, load balancers, and reverse proxies
app.set('trust proxy', 1);

// Validate required environment variables
function validateEnvironment() {
  const isStandaloneOnly = String(process.env.RIPX_STANDALONE_ONLY || '').toLowerCase() === 'true';
  const required = ['DATABASE_URL', 'JWT_SECRET', 'APP_URL'];
  const requiredAll = isStandaloneOnly
    ? required
    : [...required, 'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_SCOPES'];

  const missing = requiredAll.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    process.stderr.write('❌ Missing required environment variables:\n');
    missing.forEach(key => process.stderr.write(`   - ${key}\n`));
    process.stderr.write('\nFor standalone-only mode, set RIPX_STANDALONE_ONLY=true\n');
    process.stderr.write('See .env.example for reference.\n');
    process.exit(1);
  }

  if (isStandaloneOnly) {
    logger.info('Running in standalone-only mode (Shopify disabled)');
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  const weakPatterns = [
    'your_jwt_secret_here',
    'your_jwt_secret_here_generate_strong_random_string',
    'change_me',
    'secret',
  ];
  const isWeak =
    jwtSecret.length < 32 || weakPatterns.some(p => jwtSecret.includes(p) || jwtSecret === p);
  if (isWeak) {
    const msg =
      'JWT_SECRET is weak or default. Use a strong random string (32+ chars), e.g. openssl rand -hex 32';
    if (process.env.NODE_ENV === 'production') {
      logger.error(msg);
      process.stderr.write(`❌ ${msg}\n`);
      process.exit(1);
    }
    logger.warn(msg);
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.APP_URL || process.env.APP_URL.includes('localhost')) {
      logger.warn('APP_URL should be set to production domain in production mode');
    }
  }
}

// Validate environment on startup
validateEnvironment();

// Request correlation (must be early)
app.use(requestIdMiddleware);

// Response compression (gzip/deflate) for JSON and text
app.use(compression({ threshold: 1024 }));

// API version header and cache-control for debugging and client compatibility
app.use('/api', (req, res, next) => {
  res.set('X-API-Version', APP_VERSION);
  // Prevent caching of API responses (dynamic data)
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Serve static assets (JS/CSS/fonts) before Helmet so they don't get CSP/CORP headers
// that can cause "blocked" or failed loads in some browsers when using crossorigin.
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(
    '/assets',
    express.static(path.join(frontendDist, 'assets'), {
      maxAge: '1y',
      immutable: true,
    })
  );
}

// Security middleware
// useDefaults: false to disable upgrade-insecure-requests (causes asset load failure over HTTP)
// CSP is set in middleware below with dynamic frame-ancestors per Shopify requirement
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false, // Required for Shopify Polaris
    frameguard: false, // Use CSP frame-ancestors only (allows Shopify Admin iframe)
    hsts:
      process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  })
);

// CSP with dynamic frame-ancestors (Shopify: must be per-shop when known)
// https://shopify.dev/docs/apps/build/security/set-up-iframe-protection
const SHOP_DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
app.use((req, res, next) => {
  const raw = (req.query && req.query.shop) || req.get('x-shopify-shop-domain') || '';
  const shop = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const validShop = shop && SHOP_DOMAIN_REGEX.test(shop);

  // Per-shop when we have it; otherwise allow all Shopify (iframe often has no ?shop= or Referer on first load)
  const appCspOrigin = normalizeOriginFromUrl(process.env.APP_URL, 'http://localhost:3000');
  const frontendCspOrigin = normalizeOriginFromUrl(process.env.FRONTEND_URL, null);
  const connectSrcParts = [
    "'self'",
    appCspOrigin,
    'https://*.myshopify.com',
    'https://*.shopify.com',
  ];
  if (frontendCspOrigin && frontendCspOrigin !== appCspOrigin) {
    connectSrcParts.push(frontendCspOrigin);
  }
  const frameAncestors = validShop
    ? `https://${shop} https://admin.shopify.com ${appCspOrigin}`
    : `https://admin.shopify.com https://*.myshopify.com ${appCspOrigin}`;

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src ${connectSrcParts.join(' ')}`,
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "object-src 'none'",
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  next();
});

// CORS configuration (origins only; normalize APP_URL/FRONTEND_URL/list entries that include paths)
const defaultAppOrigin = normalizeOriginFromUrl(process.env.APP_URL, 'http://localhost:3000');
const defaultFrontendOrigin = normalizeOriginFromUrl(process.env.FRONTEND_URL, null);
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? [
      ...new Set(
        process.env.ALLOWED_ORIGINS.split(',').map(entry => {
          const t = entry.trim();
          if (!t) {
            return null;
          }
          const parsed = normalizeOriginFromUrl(t, null);
          if (!parsed) {
            logger.warn(
              'Ignoring invalid ALLOWED_ORIGINS entry (must be full origin with scheme)',
              {
                value: t,
              }
            );
          }
          return parsed;
        })
      ),
    ].filter(Boolean)
  : [
      defaultAppOrigin,
      ...(defaultFrontendOrigin && defaultFrontendOrigin !== defaultAppOrigin
        ? [defaultFrontendOrigin]
        : []),
      'http://localhost:3001', // Frontend dev server
      'http://localhost:5173', // Vite default port (if different)
      'http://localhost:5174', // Vite alternate port
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      const isProduction = process.env.NODE_ENV === 'production';

      // In development, allow any origin (Shopify dev tunnel + LAN) and requests with no origin (curl, etc.).
      if (!isProduction) {
        return callback(null, true);
      }

      // In production, allow requests with no Origin (e.g. direct navigation to / or /favicon.ico; browser often omits Origin for document requests).
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      // Allow Shopify Admin / store origins (browser sends exact origin, not *.myshopify.com)
      if (
        origin === 'https://admin.shopify.com' ||
        (origin.startsWith('https://') && origin.endsWith('.myshopify.com'))
      ) {
        return callback(null, true);
      }

      logger.warn('CORS blocked origin', { origin, allowedOrigins });
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Shopify-Shop-Domain',
      'X-Shopify-Hmac-Sha256',
      'X-RipX-API-Key',
      'X-RipX-ApiKey',
      'X-RipX-Store',
      'X-Request-ID',
    ],
  })
);

// Body parsing middleware (1MB limit to prevent DoS; webhooks use raw for HMAC)
const skipBodyParse = req => req.originalUrl?.startsWith('/api/webhooks');
app.use((req, res, next) => {
  if (skipBodyParse(req)) {
    return next();
  }
  return bodyParser.json({ limit: process.env.BODY_LIMIT || '1mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (skipBodyParse(req)) {
    return next();
  }
  return bodyParser.urlencoded({
    extended: true,
    limit: process.env.BODY_LIMIT || '1mb',
  })(req, res, next);
});
app.use(cookieParser());

// Session middleware (memory fallback; Redis when REDIS_URL is set)
if (sessionMiddleware) {
  app.use(sessionMiddleware);
}

// Request logging (with request ID for correlation)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    });
  });
  next();
});

// Rate limiting: general /api/ limiter runs first; skip paths that have their own limiters
// below so those requests are only counted by the path-specific limiter (admin, track, auth).
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS,
  message: { success: false, error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => {
    const p = req.path || '';
    const orig = req.originalUrl || '';
    return (
      p === '/health' ||
      p === '/live' ||
      p === '/ready' ||
      orig.startsWith('/api/health') ||
      orig.startsWith('/api/live') ||
      orig.startsWith('/api/ready') ||
      orig.startsWith('/api/track') ||
      orig.startsWith('/api/webhooks') ||
      orig.startsWith('/api/admin') ||
      orig.startsWith('/api/auth') ||
      orig.startsWith('/api/support')
    );
  },
});
app.use('/api/', apiLimiter);

const adminLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_ADMIN_MAX, 10) || 120,
  message: { success: false, error: 'Too many admin requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/admin', adminLimiter);

const trackLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_TRACK_MAX, 10) || 2000,
  message: { success: false, error: 'Too many tracking requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/track', trackLimiter);

const authLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 30,
  message: { success: false, error: 'Too many auth attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't count GET /api/auth/install (install page + redirect to Shopify); uses signed token, not a login attempt.
  // req.path may be full path (/api/auth/install) or relative to mount (/install) depending on Express version.
  skip: req =>
    req.method === 'GET' &&
    (req.path === '/install' ||
      req.path === '/api/auth/install' ||
      (req.originalUrl && req.originalUrl.includes('/auth/install'))),
});
app.use('/api/auth', authLimiter);

// Stricter limit for client-error reporting (unauthenticated); reduces abuse risk
const clientErrorLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_CLIENT_ERROR_MAX, 10) || 100,
  message: { success: false, error: 'Too many error reports, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/track/client-error', clientErrorLimiter);

// Public QA endpoint — stricter than generic track bucket to limit enumeration / DB work
const priceCheckoutDiagnosticsLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_PRICE_DIAGNOSTICS_MAX, 10) || 120,
  message: {
    success: false,
    error:
      'Too many checkout diagnostics requests. Try again later or use Settings → Installation from the app.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/track/price-checkout-diagnostics', priceCheckoutDiagnosticsLimiter);

const tenantLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_TENANT_MAX, 10) || 10,
  message: { success: false, error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/tenants', tenantLimiter);

const supportLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_SUPPORT_MAX, 10) || 10,
  message: { success: false, error: 'Too many support requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.path === '/chat' || (req.originalUrl && req.originalUrl.endsWith('/chat')),
});
app.use('/api/support', supportLimiter);

// Stricter per-IP limit for support chat (more requests than tickets, but still bounded)
const supportChatLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_SUPPORT_CHAT_MAX, 10) || 40,
  message: { success: false, error: 'Too many chat messages. Please try again in a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/support/chat', supportChatLimiter);

// API docs (Swagger UI at /api-docs)
app.use('/api-docs', apiDocsRoutes);

// Set when SIGTERM/SIGINT received so health returns 503 during drain (load balancers stop sending traffic)
let isShuttingDown = false;

// Shared Redis client for health checks (reused to avoid creating a new connection per request)
let healthRedisClient = null;

async function getHealthRedisClient() {
  if (healthRedisClient) {
    return healthRedisClient;
  }
  const { createClient } = require('redis');
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  healthRedisClient = client;
  return client;
}

// Health check endpoints (unauthenticated, for monitoring)
//
// Best practice split:
// - /live, /api/live — liveness: process up, no DB/Redis (cheap for frequent probes)
// - /ready, /api/ready — readiness: DB + Redis only, minimal JSON (503 when DB down)
// - /health, /api/health — full payload for app + operators (version, uptime, maintenance, banner)
//
// Dedicated per-IP rate limit (RATE_LIMIT_HEALTH_*), separate from general /api/ bucket.
const healthLimiter = rateLimit({
  windowMs: RATE_LIMIT.HEALTH_WINDOW_MS,
  max: RATE_LIMIT.HEALTH_MAX,
  message: { success: false, error: 'Too many health requests from this IP.' },
  standardHeaders: true,
  legacyHeaders: false,
});

async function runReadinessChecks() {
  let dbStatus = 'unknown';
  let redisStatus = 'skipped';
  try {
    const { ping } = require('./utils/database');
    await ping();
    dbStatus = 'ok';
  } catch (_err) {
    dbStatus = 'error';
  }
  if (process.env.REDIS_URL) {
    try {
      const client = await getHealthRedisClient();
      await client.ping();
      redisStatus = 'ok';
    } catch (_err) {
      redisStatus = 'error';
      healthRedisClient = null; // allow reconnect on next check
    }
  }
  const overall =
    dbStatus === 'ok' && (redisStatus === 'skipped' || redisStatus === 'ok') ? 'ok' : 'degraded';
  return { dbStatus, redisStatus, overall };
}

async function loadHealthKvExtras() {
  let maintenanceValue = null;
  let maintenanceMessage = null;
  let announcementBanner = null;
  try {
    const { query } = require('./utils/database');
    const { getMaintenanceMode } = require('./utils/maintenanceMode');
    maintenanceValue = await getMaintenanceMode();
    const kv = await query('SELECT key, value FROM key_value_store WHERE key IN ($1, $2)', [
      KV_KEYS.ANNOUNCEMENT_BANNER,
      KV_KEYS.MAINTENANCE_MESSAGE,
    ]);
    for (const row of kv.rows || []) {
      const v =
        row.value !== null && row.value !== undefined && String(row.value).trim() !== ''
          ? String(row.value).trim()
          : null;
      if (row.key === KV_KEYS.ANNOUNCEMENT_BANNER && v) {
        announcementBanner = v;
      }
      if (row.key === KV_KEYS.MAINTENANCE_MESSAGE && v) {
        maintenanceMessage = v;
      }
    }
  } catch (_kvErr) {
    // Optional table or KV failure; do not mark DB unhealthy
  }
  return { maintenanceValue, maintenanceMessage, announcementBanner };
}

const liveHandler = async (req, res) => {
  if (isShuttingDown) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
    });
    return;
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};

const readyHandler = async (req, res) => {
  if (isShuttingDown) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'shutting_down',
      checks: { db: 'skipped', redis: 'skipped' },
      timestamp: new Date().toISOString(),
    });
    return;
  }
  const { dbStatus, redisStatus, overall } = await runReadinessChecks();
  if (dbStatus === 'error') {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  res.json({
    status: overall,
    checks: { db: dbStatus, redis: redisStatus },
    timestamp: new Date().toISOString(),
  });
};

const healthHandler = async (req, res) => {
  if (isShuttingDown) {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      status: 'shutting_down',
      checks: { db: 'skipped', redis: 'skipped' },
      timestamp: new Date().toISOString(),
    });
    return;
  }
  const { dbStatus, redisStatus, overall } = await runReadinessChecks();
  let maintenanceValue = null;
  let maintenanceMessage = null;
  let announcementBanner = null;
  if (dbStatus === 'ok') {
    const extras = await loadHealthKvExtras();
    maintenanceValue = extras.maintenanceValue;
    maintenanceMessage = extras.maintenanceMessage;
    announcementBanner = extras.announcementBanner;
  }
  if (dbStatus === 'error') {
    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  const payload = {
    status: overall,
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: { db: dbStatus, redis: redisStatus },
  };
  if (maintenanceValue) {
    payload.maintenance = true;
    payload.maintenanceMessage = maintenanceMessage || maintenanceValue;
  }
  if (announcementBanner) {
    payload.announcementBanner = announcementBanner;
  }
  res.json(payload);
};

app.get('/live', healthLimiter, asyncHandler(liveHandler));
app.get('/api/live', healthLimiter, asyncHandler(liveHandler));
app.get('/ready', healthLimiter, asyncHandler(readyHandler));
app.get('/api/ready', healthLimiter, asyncHandler(readyHandler));
app.get('/health', healthLimiter, asyncHandler(healthHandler));
app.get('/api/health', healthLimiter, asyncHandler(healthHandler));

// Public config (Terms/Privacy URLs for app footer)
app.get(
  '/api/config/legal',
  asyncHandler(async (req, res) => {
    const { query } = require('./utils/database');
    const kv = await query('SELECT key, value FROM key_value_store WHERE key IN ($1, $2)', [
      KV_KEYS.TERMS_URL,
      KV_KEYS.PRIVACY_URL,
    ]);
    const termsUrl = kv.rows.find(r => r.key === KV_KEYS.TERMS_URL)?.value;
    const privacyUrl = kv.rows.find(r => r.key === KV_KEYS.PRIVACY_URL)?.value;
    res.json({
      success: true,
      termsUrl:
        termsUrl !== null && termsUrl !== undefined && String(termsUrl).trim() !== ''
          ? String(termsUrl).trim()
          : null,
      privacyUrl:
        privacyUrl !== null && privacyUrl !== undefined && String(privacyUrl).trim() !== ''
          ? String(privacyUrl).trim()
          : null,
    });
  })
);

// API Routes (auth always mounted for standalone email login/register)
app.use('/api/auth', authRoutes);
app.use('/api/me', authenticate, requireEmailSession, meRoutes);
app.use('/api/tenants', tenantRoutes); // Tenant registration (standalone)
app.use('/api/account', authenticate, accountRoutes); // Multi-store: list/add stores
app.use('/api/dashboard', authenticate, require('./routes/dashboardRoutes'));
app.use('/api/tests', authenticate, testRoutes);
app.use('/api/analytics', authenticate, analyticsRoutes);
app.use('/api/shopify', authenticateShopify, shopifyRoutes); // Shopify-specific (requires shop)
app.use('/api/track', trackRoutes); // Public endpoint for tracking
app.use('/api/proxy', proxyRoutes); // App proxy endpoints (no auth, uses signature)
app.use('/api/webhooks', webhookRoutes); // Webhook endpoints (no auth, uses HMAC)
app.use('/api/promo-links', authenticate, promoLinkRoutes);
app.use('/api/profile', authenticate, profileRoutes);
app.use('/api/settings', authenticate, settingsRoutes);
app.use('/api/targeting-presets', authenticate, targetingPresetRoutes);
app.use('/api/notifications', authenticate, notificationRoutes);
app.use('/api/support', supportRoutes); // Ticket submit (public) + My tickets (authenticated)
app.use('/api/admin', adminRoutes); // Admin panel (requireAdmin inside router)

// 404 handler for API routes - return JSON for unmatched /api/* paths
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.originalUrl,
  });
});

// Shopify Discount Function UI deep-links can open discount paths directly.
// Normalize both direct and embedded-admin paths to the app settings Installation tab.
const buildDiscountLaunchRedirect = ({ req, basePrefix = '' }) => {
  const nextQuery = new URLSearchParams();
  Object.entries(req.query || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => {
        if (v !== undefined && v !== null) {
          nextQuery.append(key, String(v));
        }
      });
      return;
    }
    if (value !== undefined && value !== null) {
      nextQuery.set(key, String(value));
    }
  });
  nextQuery.set('launch', 'discount_setup');
  const shopHeader = String(req.get('x-shopify-shop-domain') || '')
    .trim()
    .toLowerCase();
  if (!nextQuery.get('shop') && SHOP_DOMAIN_REGEX.test(shopHeader)) {
    nextQuery.set('shop', shopHeader);
  }
  const shop = String(nextQuery.get('shop') || '')
    .trim()
    .toLowerCase();
  if (SHOP_DOMAIN_REGEX.test(shop)) {
    nextQuery.set('tab', 'installation');
    nextQuery.set('auto_discount_setup', '1');
    return `${basePrefix}/app/${encodeURIComponent(shop)}/settings?${nextQuery.toString()}`;
  }
  const suffix = nextQuery.toString();
  return suffix ? `${basePrefix}/?${suffix}` : `${basePrefix || '/'}`;
};

app.get('/discounts/*', (req, res) => {
  return res.redirect(buildDiscountLaunchRedirect({ req }));
});

app.get('/store/:store/apps/:app/discounts/*', (req, res) => {
  const store = String(req.params.store || '')
    .trim()
    .toLowerCase();
  const appHandle = String(req.params.app || '').trim();
  const inferredShop = `${store}.myshopify.com`;
  if (!req.query?.shop && SHOP_DOMAIN_REGEX.test(inferredShop)) {
    req.query.shop = inferredShop;
  }
  const basePrefix = `/store/${encodeURIComponent(store)}/apps/${encodeURIComponent(appHandle)}`;
  return res.redirect(buildDiscountLaunchRedirect({ req, basePrefix }));
});

// Some Shopify launches arrive at "/" with path hints in query (?path=/discounts/...).
// Normalize those the same way so we don't depend on client-side parsing.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {return next();}
  const launch = String(req.query?.launch || '')
    .trim()
    .toLowerCase();
  if (launch === 'discount_setup') {return next();}
  const hint = String(req.query?.path || req.query?.return_to || req.query?.redirect || '')
    .trim()
    .toLowerCase();
  if (!/discount|function/.test(hint)) {return next();}
  return res.redirect(buildDiscountLaunchRedirect({ req }));
});

// Reject requests for source paths (e.g. /src/App.jsx from dev index). Prevents blank page when tunnel serves dev HTML but backend can't serve /src/*.
app.get('/src/*', (_req, res) => {
  res.status(404).send('Not found');
});

// Serve built SPA when frontend/dist exists (production or tunnel: avoid /src/* requests that cause 500/blank page).
const path = require('path');
const fs = require('fs');
const frontendDist = path.join(__dirname, '../../frontend/dist');
const distExists =
  fs.existsSync(frontendDist) && fs.existsSync(path.join(frontendDist, 'index.html'));
if (distExists) {
  // Serve /assets/* first so JS/CSS get correct MIME type (never fall through to SPA catch-all).
  const assetsDir = path.join(frontendDist, 'assets');
  if (fs.existsSync(assetsDir)) {
    app.use(
      '/assets',
      express.static(assetsDir, {
        maxAge: '1y',
        immutable: true,
      })
    );
  }
  app.use(
    express.static(frontendDist, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    // Do not send index.html for asset requests (avoids "MIME type text/html" for .js/.css).
    if (
      req.path.startsWith('/assets/') ||
      /\.(js|mjs|css|ico|svg|png|woff2?)(\?|$)/i.test(req.path)
    ) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handling middleware (must be last)
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  // In production, exit on unhandled rejections
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', { error });
  process.exit(1);
});

// Start server only when run directly (e.g. node app.js). When required (e.g. by supertest),
// do not listen so the app can be used with request(app) without binding to PORT.
if (require.main === module) {
  const server = app.listen(PORT, () => {
    server.timeout = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 60000;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    logger.info('RipX server started', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      version: APP_VERSION,
    });
    // Shopify OAuth: remind deployers to align Partner Dashboard with redirect_uri; warn if using dynamic tunnel URL
    if (
      process.env.SHOPIFY_API_KEY &&
      process.env.SHOPIFY_API_KEY !== 'your_shopify_api_key_here' &&
      process.env.RIPX_STANDALONE_ONLY !== 'true'
    ) {
      const oauthBase =
        process.env.RIPX_OAUTH_REDIRECT_BASE ||
        process.env.APP_URL ||
        process.env.FRONTEND_URL ||
        'http://localhost:3000';
      const base = String(oauthBase).replace(/\/+$/, '') || 'http://localhost:3000';
      const isDynamicTunnel =
        /\.trycloudflare\.com$/i.test(base) ||
        /\.ngrok-free\.app$/i.test(base) ||
        /\.ngrok\.(io|app)$/i.test(base);
      if (isDynamicTunnel) {
        logger.warn(
          'Shopify OAuth: APP_URL/RIPX_OAUTH_REDIRECT_BASE is a dynamic tunnel (*.trycloudflare.com). It changes when the tunnel restarts. Also: shopify.app.toml redirect_urls (e.g. splitter.echologyx.com) do NOT auto-add the tunnel — add this exact callback in Partner Dashboard → Apps → [app] → URLs → Allowed redirection URL(s), and set Application URL to the same host. Or use a stable domain in RIPX_OAUTH_REDIRECT_BASE + Dashboard. See .env.example (Shopify OAuth / tunnel).'
        );
      }
      logger.info(
        'Shopify OAuth: ensure Partner Dashboard Application URL and Allowed redirection URL(s) match',
        {
          expectedCallback: `${base}/api/auth/callback`,
          hint: 'GET /api/auth/oauth-redirect-uri on your app host returns exact values to copy into Partner Dashboard.',
        }
      );
    }
    // Optional: verify SMTP connection in background (logs success or failure)
    const emailService = require('./services/emailService');
    if (emailService.isConfigured()) {
      emailService.verifyConnection().catch(() => {});
    }
  });

  const gracefulShutdown = signal => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    logger.info(`${signal} received, shutting down gracefully`);

    server.close(() => {
      logger.info('HTTP server closed');
      const closeRedis = healthRedisClient
        ? healthRedisClient.quit().catch(err => {
            logger.warn('Health Redis close', { err: err?.message });
            return Promise.resolve();
          })
        : Promise.resolve();
      closeRedis.then(() => {
        const { closeDatabase } = require('./utils/database');
        closeDatabase()
          .then(() => {
            logger.info('Database connections closed');
            process.exit(0);
          })
          .catch(error => {
            logger.error('Error during shutdown', { error });
            process.exit(1);
          });
      });
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
