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
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const testRoutes = require('./routes/testRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const shopifyRoutes = require('./routes/shopifyRoutes');
const trackRoutes = require('./routes/trackRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const promoLinkRoutes = require('./routes/promoLinkRoutes');
const profileRoutes = require('./routes/profileRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { authenticateShopify } = require('./middleware/auth');
const { RATE_LIMIT } = require('./constants');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables
function validateEnvironment() {
  const required = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'DATABASE_URL',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nPlease check your .env file or see .env.example for reference.');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.APP_URL || process.env.APP_URL.includes('localhost')) {
      logger.warn('APP_URL should be set to production domain in production mode');
    }
  }
}

// Validate environment on startup
validateEnvironment();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Shopify Polaris requires inline styles
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.APP_URL || 'http://localhost:3000']
    }
  },
  crossOriginEmbedderPolicy: false // Required for Shopify Polaris
}));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      process.env.APP_URL || 'http://localhost:3000',
      'http://localhost:3001', // Frontend dev server
      'http://localhost:5173', // Vite default port (if different)
      'http://localhost:5174'  // Vite alternate port
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.) in development
      if (!origin && process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      
      // In development, allow localhost on any port
      if (process.env.NODE_ENV !== 'production' && origin && origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
      
      if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked origin', { origin, allowedOrigins });
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Shopify-Shop-Domain', 'X-Shopify-Hmac-Sha256']
  })
);

// Body parsing middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip rate limiting for health checks
  skip: (req) => req.path === '/health'
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/tests', authenticateShopify, testRoutes);
app.use('/api/analytics', authenticateShopify, analyticsRoutes);
app.use('/api/shopify', authenticateShopify, shopifyRoutes);
app.use('/api/track', trackRoutes); // Public endpoint for tracking
app.use('/api/webhooks', webhookRoutes); // Webhook endpoints (no auth, uses HMAC)
app.use('/api/promo-links', authenticateShopify, promoLinkRoutes);
app.use('/api/profile', authenticateShopify, profileRoutes);

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
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error });
  process.exit(1);
});

// Start server
const server = app.listen(PORT, () => {
  logger.info('RipX server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Graceful shutdown for server
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    // Close database connections
    const { closeDatabase } = require('./utils/database');
    closeDatabase().then(() => {
      logger.info('Database connections closed');
      process.exit(0);
    }).catch((error) => {
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
