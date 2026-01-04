/**
 * Profile Routes
 *
 * API endpoints for user profile, account, and preferences management
 */

const express = require('express');
const router = express.Router();
const {
  getProfile,
  upsertProfile,
  updateAccount,
  updatePreferences
} = require('../models/user');
const { sendSuccess, sendError, sendNotFound } = require('../utils/response');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../constants');
const logger = require('../utils/logger');

/**
 * GET /api/profile
 * Get user profile, account, and preferences
 */
router.get('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;

    const userData = await getProfile(shopDomain);

    if (!userData) {
      // Return defaults if user doesn't exist yet
      return sendSuccess(res, HTTP_STATUS.OK, {
        profile: {
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          jobTitle: '',
          company: shopDomain,
          bio: '',
          timezone: 'UTC',
          language: 'en',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h'
        },
        account: {
          shopDomain,
          plan: 'Professional',
          billingEmail: '',
          apiKey: '',
          twoFactorEnabled: false,
          emailNotifications: true,
          pushNotifications: true,
          weeklyReports: true
        },
        preferences: {
          theme: 'light',
          dashboardView: 'grid',
          defaultTestType: 'price',
          autoSave: true,
          showTooltips: true,
          compactMode: false
        }
      }, 'Profile data retrieved');
    }

    logger.info('Profile retrieved', { shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      userData,
      'Profile data retrieved'
    );
  } catch (error) {
    // If table doesn't exist, return defaults instead of error
    if (error.message && error.message.includes('does not exist')) {
      logger.warn('Users table does not exist, returning defaults', { shopDomain: req.shopDomain });
      return sendSuccess(res, HTTP_STATUS.OK, {
        profile: {
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          jobTitle: '',
          company: req.shopDomain,
          bio: '',
          timezone: 'UTC',
          language: 'en',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h'
        },
        account: {
          shopDomain: req.shopDomain,
          plan: 'Professional',
          billingEmail: '',
          apiKey: '',
          twoFactorEnabled: false,
          emailNotifications: true,
          pushNotifications: true,
          weeklyReports: true
        },
        preferences: {
          theme: 'light',
          dashboardView: 'grid',
          defaultTestType: 'price',
          autoSave: true,
          showTooltips: true,
          compactMode: false
        }
      }, 'Profile data retrieved (using defaults - table not created yet)');
    }
    logger.error('Error getting profile', { error: error.message, shopDomain: req.shopDomain });
    next(error);
  }
});

/**
 * PUT /api/profile/profile
 * Update user profile
 */
router.put('/profile', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const profileData = req.body;

    // Validate required fields
    if (!profileData) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Profile data is required');
    }

    const result = await upsertProfile(shopDomain, profileData);

    logger.info('Profile updated', { shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      result,
      SUCCESS_MESSAGES.PROFILE_UPDATED || 'Profile updated successfully'
    );
  } catch (error) {
    // If table doesn't exist, return helpful error
    if (error.message && error.message.includes('does not exist')) {
      logger.warn('Users table does not exist', { shopDomain: req.shopDomain });
      return sendError(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Database table not found. Please run migrations: npm run migrate'
      );
    }
    logger.error('Error updating profile', { error: error.message, shopDomain: req.shopDomain });
    next(error);
  }
});

/**
 * PUT /api/profile/account
 * Update account settings
 */
router.put('/account', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const accountData = req.body;

    // Validate required fields
    if (!accountData) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Account data is required');
    }

    const result = await updateAccount(shopDomain, accountData);

    logger.info('Account updated', { shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      result,
      SUCCESS_MESSAGES.ACCOUNT_UPDATED || 'Account settings updated successfully'
    );
  } catch (error) {
    // If table doesn't exist, return helpful error
    if (error.message && error.message.includes('does not exist')) {
      logger.warn('Users table does not exist', { shopDomain: req.shopDomain });
      return sendError(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Database table not found. Please run migrations: npm run migrate'
      );
    }
    logger.error('Error updating account', { error: error.message, shopDomain: req.shopDomain });
    next(error);
  }
});

/**
 * PUT /api/profile/preferences
 * Update user preferences
 */
router.put('/preferences', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const preferences = req.body;

    // Validate required fields
    if (!preferences) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Preferences data is required');
    }

    const result = await updatePreferences(shopDomain, preferences);

    logger.info('Preferences updated', { shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      result,
      SUCCESS_MESSAGES.PREFERENCES_UPDATED || 'Preferences updated successfully'
    );
  } catch (error) {
    // If table doesn't exist, return helpful error
    if (error.message && error.message.includes('does not exist')) {
      logger.warn('Users table does not exist', { shopDomain: req.shopDomain });
      return sendError(
        res,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Database table not found. Please run migrations: npm run migrate'
      );
    }
    logger.error('Error updating preferences', { error: error.message, shopDomain: req.shopDomain });
    next(error);
  }
});

module.exports = router;

