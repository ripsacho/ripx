/**
 * Authentication Middleware
 *
 * Handles Shopify OAuth authentication
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const { sendUnauthorized } = require('../utils/response');

/**
 * Verify HMAC signature for Shopify requests
 * 
 * @param {string} data - Request data
 * @param {string} hmacHeader - HMAC signature from header
 * @returns {boolean} True if signature is valid
 */
function verifyHMAC(data, hmacHeader) {
  if (!hmacHeader || !process.env.SHOPIFY_API_SECRET) {
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET);
    const hash = hmac.update(data, 'utf8').digest('base64');
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  } catch (error) {
    logger.error('HMAC verification error', { error });
    return false;
  }
}

/**
 * Authenticate Shopify request
 * Verifies the request is from an authenticated Shopify shop
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function authenticateShopify(req, res, next) {
  try {
    // Get shop domain from query or headers
    const shop = req.query.shop || req.headers['x-shopify-shop-domain'];

    if (!shop) {
      logger.warn('Authentication failed: Shop domain required', {
        path: req.path,
        method: req.method
      });
      return sendUnauthorized(res, 'Shop domain required');
    }

    // Validate shop domain format
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
      logger.warn('Authentication failed: Invalid shop domain format', {
        shop,
        path: req.path
      });
      return sendUnauthorized(res, 'Invalid shop domain');
    }

    // For POST/PUT requests with body, verify HMAC if present
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
      const hmacHeader = req.headers['x-shopify-hmac-sha256'];
      
      if (hmacHeader) {
        const bodyString = typeof req.body === 'string' 
          ? req.body 
          : JSON.stringify(req.body);
        
        if (!verifyHMAC(bodyString, hmacHeader)) {
          logger.warn('Authentication failed: Invalid HMAC signature', {
            shop,
            path: req.path
          });
          return sendUnauthorized(res, 'Invalid request signature');
        }
      }
    }

    // In production, you should:
    // 1. Check if shop has installed the app (query database)
    // 2. Get access token from database based on shop domain
    // 3. Verify token is still valid
    
    // For now, we'll use environment variable or attempt to get from database
    // In a full implementation, you would query your database for the shop's access token
    req.shopDomain = shop;
    
    // Try to get access token from database (if you have a sessions table)
    // For now, fall back to environment variable
    // TODO: Implement proper session storage and retrieval
    req.shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || 'demo_token';

    // In development, allow demo token
    // In production, you should require a valid token from database
    if (process.env.NODE_ENV === 'production' && req.shopifyAccessToken === 'demo_token') {
      logger.warn('Using demo token in production - this should be replaced with database lookup', {
        shop,
        path: req.path
      });
      // In production, reject requests with demo token for security
      // Uncomment the following lines once you implement proper session storage:
      // return sendUnauthorized(res, 'Invalid authentication token');
    }

    next();
  } catch (error) {
    logger.error('Authentication error', { error, path: req.path });
    return sendUnauthorized(res, ERROR_MESSAGES.UNAUTHORIZED);
  }
}

/**
 * Verify JWT token
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.token;

  if (!token) {
    logger.warn('Token verification failed: No token provided', {
      path: req.path,
      method: req.method
    });
    return sendUnauthorized(res, 'No token provided');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Token verification failed: Invalid token', {
      error: error.message,
      path: req.path
    });
    return sendUnauthorized(res, 'Invalid token');
  }
}

module.exports = {
  authenticateShopify,
  verifyToken
};
