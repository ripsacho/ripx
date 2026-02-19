/**
 * RipX - Main Express Application
 *
 * This is the entry point for the RipX backend server.
 * It sets up Express server, middleware, routes, and error handling.
 *
 * @module app
 * @version 1.0.0
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
require('dotenv').config();

const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const startTime = Date.now();

// Start background job processors (Bull)
try {
  require('./jobs/scheduledTestsProcessor');
  require('./jobs/archiveProcessor');
  try {
    require('./jobs/guardrailProcessor').startGuardrailProcessor();
  } catch (e) {
    logger.warn('Guardrail processor not started', { error: e.message });
  }
  try {
    require('./jobs/autoStopProcessor').startAutoStopProcessor();
  } catch (e) {
    logger.warn('Auto-stop processor not started', { error: e.message });
  }
  try {
    require('./jobs/significanceAlertProcessor').startSignificanceAlertProcessor();
  } catch (e) {
    logger.warn('Significance alert processor not started', { error: e.message });
  }
} catch (err) {
  logger.warn('Job processors not started (Redis?)', { error: err.message });
}

let sessionMiddleware = null;
try {
  const session = require('express-session');
  const { createSessionStore } = require('./config/sessionStore');
  const sessionStore = createSessionStore();
  sessionMiddleware = session({
    store: sessionStore || undefined,
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  });
} catch (err) {
  logger.warn('express-session not available, skipping session middleware', { error: err.message });
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
const tenantRoutes = require('./routes/tenantRoutes');
const accountRoutes = require('./routes/accountRoutes');
const authRoutes = require('./routes/authRoutes');
const apiDocsRoutes = require('./routes/apiDocsRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { requestIdMiddleware } = require('./middleware/requestId');
const { authenticate, authenticateShopify } = require('./middleware/auth');
const { RATE_LIMIT } = require('./constants');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Shopify CLI tunnels, load balancers, and reverse proxies
app.set('trust proxy', 1);

// Validate required environment variables
function validateEnvironment() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'APP_URL'];
  const shopifyRequired = !process.env.RIPX_STANDALONE_ONLY;
  const requiredAll = shopifyRequired
    ? [...required, 'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_SCOPES']
    : required;

  const missing = requiredAll.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    process.stderr.write('❌ Missing required environment variables:\n');
    missing.forEach(key => process.stderr.write(`   - ${key}\n`));
    process.stderr.write('\nFor standalone-only mode, set RIPX_STANDALONE_ONLY=true\n');
    process.stderr.write('See .env.example for reference.\n');
    process.exit(1);
  }

  if (process.env.RIPX_STANDALONE_ONLY === 'true') {
    logger.info('Running in standalone-only mode (Shopify disabled)');
  } else if (!process.env.SHOPIFY_API_KEY) {
    logger.warn('Shopify not configured; only standalone sites will work');
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32 || jwtSecret === 'your_jwt_secret_here') {
    logger.warn(
      'JWT_SECRET is weak or default. Use a strong random string (32+ chars) in production.'
    );
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

// Security middleware
// useDefaults: false to disable upgrade-insecure-requests (causes asset load failure over HTTP)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          process.env.APP_URL || 'http://localhost:3000',
          'https://*.myshopify.com',
          'https://*.shopify.com',
        ],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for Shopify Polaris
  })
);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      process.env.APP_URL || 'http://localhost:3000',
      'http://localhost:3001', // Frontend dev server
      'http://localhost:5173', // Vite default port (if different)
      'http://localhost:5174', // Vite alternate port
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      const isProduction = process.env.NODE_ENV === 'production';

      // In development, allow any origin (Shopify dev tunnel + LAN).
      if (!isProduction) {
        return callback(null, true);
      }

      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
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
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/webhooks')) {
    return next();
  }
  return bodyParser.json({ limit: process.env.BODY_LIMIT || '1mb' })(req, res, next);
});
app.use(bodyParser.urlencoded({ extended: true }));
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

// Rate limiting - general API (skip track, health; track has its own higher limit)
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: req =>
    req.path === '/health' ||
    req.originalUrl === '/api/health' ||
    req.originalUrl?.startsWith('/api/track') ||
    req.originalUrl?.startsWith('/api/webhooks'),
});
app.use('/api/', apiLimiter);

// Track endpoint: higher limit for storefront traffic (public, high volume)
const trackLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_TRACK_MAX, 10) || 2000,
  message: 'Too many tracking requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/track', trackLimiter);

// API docs (Swagger UI at /api-docs)
app.use('/api-docs', apiDocsRoutes);

// Health check endpoints (unauthenticated, for monitoring)
const healthHandler = async (req, res) => {
  let dbStatus = 'unknown';
  let redisStatus = 'skipped';
  try {
    const { query } = require('./utils/database');
    await query('SELECT 1');
    dbStatus = 'ok';
  } catch (err) {
    dbStatus = 'error';
  }
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require('redis');
      const client = createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.ping();
      await client.quit();
      redisStatus = 'ok';
    } catch (err) {
      redisStatus = 'error';
    }
  }
  const overall =
    dbStatus === 'ok' && (redisStatus === 'skipped' || redisStatus === 'ok') ? 'ok' : 'degraded';
  res.json({
    status: overall,
    version: APP_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: { db: dbStatus, redis: redisStatus },
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// API Routes
if (process.env.RIPX_STANDALONE_ONLY !== 'true') {
  app.use('/api/auth', authRoutes);
}
app.use('/api/tenants', tenantRoutes); // Tenant registration (standalone)
app.use('/api/account', authenticate, accountRoutes); // Multi-store: list/add stores
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

// 404 handler for API routes - return JSON for unmatched /api/* paths
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.originalUrl,
  });
});

// Production: serve frontend static files (SPA)
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
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

// Start server
const server = app.listen(PORT, () => {
  server.timeout = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 60000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  logger.info('RipX server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: APP_VERSION,
  });
});

// Graceful shutdown for server
const gracefulShutdown = signal => {
  logger.info(`${signal} received, shutting down gracefully`);

  server.close(() => {
    logger.info('HTTP server closed');
    // Close database connections
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

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
