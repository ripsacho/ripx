/**
 * User Model
 *
 * Database operations for user profile, account, and preferences
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

/**
 * Safely parse JSON with error handling
 */
function safeParseJSON(jsonString, defaultValue) {
  if (!jsonString) {
    return defaultValue;
  }

  if (typeof jsonString === 'object') {
    return jsonString;
  }

  try {
    return JSON.parse(jsonString);
  } catch (e) {
    logger.error('Error parsing JSON', { error: e.message });
    return defaultValue;
  }
}

class UserModel {
  /**
   * Get user profile by shop domain
   *
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object|null>} User profile or null
   */
  async getProfile(shopDomain) {
    try {
      const sql = `
        SELECT profile, account, preferences, created_at, updated_at
        FROM users
        WHERE shop_domain = $1
      `;

      const result = await query(sql, [shopDomain]);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        profile: safeParseJSON(user.profile, {}),
        account: safeParseJSON(user.account, {}),
        preferences: safeParseJSON(user.preferences, {
          theme: 'light',
          dashboardView: 'grid',
          defaultTestType: 'price',
          autoSave: true,
          showTooltips: true,
          compactMode: false,
        }),
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      };
    } catch (error) {
      // If table doesn't exist, return null (will trigger defaults in route)
      if (error.message && error.message.includes('does not exist')) {
        // Only log once per session to avoid spam
        if (!this._tableMissingLogged) {
          logger.warn(
            'Users table does not exist. Using defaults. Run migrations to create table.',
            { shopDomain }
          );
          this._tableMissingLogged = true;
        }
        return null;
      }
      throw error;
    }
  }

  /**
   * Create or update user profile
   *
   * @param {string} shopDomain - Shop domain
   * @param {Object} profileData - Profile data
   * @returns {Promise<Object>} Updated profile
   */
  async upsertProfile(shopDomain, profileData) {
    try {
      // Check if user exists
      const existing = await this.getProfile(shopDomain);

      if (existing) {
        // Update existing user
        const sql = `
          UPDATE users
          SET profile = $1, updated_at = NOW()
          WHERE shop_domain = $2
          RETURNING profile, updated_at
        `;

        const result = await query(sql, [JSON.stringify(profileData), shopDomain]);

        return {
          profile: safeParseJSON(result.rows[0].profile, {}),
          updatedAt: result.rows[0].updated_at,
        };
      } else {
        // Create new user
        const sql = `
          INSERT INTO users (shop_domain, profile, account, preferences, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          RETURNING profile, updated_at
        `;

        const defaultAccount = {
          shopDomain,
          plan: 'Professional',
          billingEmail: '',
          apiKey: '',
          twoFactorEnabled: false,
          emailNotifications: true,
          pushNotifications: true,
          weeklyReports: true,
        };

        const defaultPreferences = {
          theme: 'light',
          dashboardView: 'grid',
          defaultTestType: 'price',
          autoSave: true,
          showTooltips: true,
          compactMode: false,
        };

        const result = await query(sql, [
          shopDomain,
          JSON.stringify(profileData),
          JSON.stringify(defaultAccount),
          JSON.stringify(defaultPreferences),
        ]);

        return {
          profile: safeParseJSON(result.rows[0].profile, {}),
          updatedAt: result.rows[0].updated_at,
        };
      }
    } catch (error) {
      // If table doesn't exist, throw error to be handled by route
      if (error.message && error.message.includes('does not exist')) {
        logger.warn('Users table does not exist', { shopDomain });
        throw new Error('Users table does not exist. Please run migrations.');
      }
      throw error;
    }
  }

  /**
   * Update user account settings
   *
   * @param {string} shopDomain - Shop domain
   * @param {Object} accountData - Account data
   * @returns {Promise<Object>} Updated account
   */
  async updateAccount(shopDomain, accountData) {
    try {
      // Check if user exists, create if not
      const existing = await this.getProfile(shopDomain);

      if (!existing) {
        // Create user with defaults
        await this.upsertProfile(shopDomain, {
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
          timeFormat: '12h',
        });
      }

      const sql = `
        UPDATE users
        SET account = $1, updated_at = NOW()
        WHERE shop_domain = $2
        RETURNING account, updated_at
      `;

      const result = await query(sql, [JSON.stringify(accountData), shopDomain]);

      return {
        account: safeParseJSON(result.rows[0].account, {}),
        updatedAt: result.rows[0].updated_at,
      };
    } catch (error) {
      // If table doesn't exist, throw error to be handled by route
      if (error.message && error.message.includes('does not exist')) {
        logger.warn('Users table does not exist', { shopDomain });
        throw new Error('Users table does not exist. Please run migrations.');
      }
      throw error;
    }
  }

  /**
   * Update user preferences
   *
   * @param {string} shopDomain - Shop domain
   * @param {Object} preferences - Preferences data
   * @returns {Promise<Object>} Updated preferences
   */
  async updatePreferences(shopDomain, preferences) {
    try {
      // Check if user exists, create if not
      const existing = await this.getProfile(shopDomain);

      if (!existing) {
        // Create user with defaults
        await this.upsertProfile(shopDomain, {
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
          timeFormat: '12h',
        });
      }

      const sql = `
        UPDATE users
        SET preferences = $1, updated_at = NOW()
        WHERE shop_domain = $2
        RETURNING preferences, updated_at
      `;

      const result = await query(sql, [JSON.stringify(preferences), shopDomain]);

      return {
        preferences: safeParseJSON(result.rows[0].preferences, {}),
        updatedAt: result.rows[0].updated_at,
      };
    } catch (error) {
      // If table doesn't exist, throw error to be handled by route
      if (error.message && error.message.includes('does not exist')) {
        logger.warn('Users table does not exist', { shopDomain });
        throw new Error('Users table does not exist. Please run migrations.');
      }
      throw error;
    }
  }
}

// Export singleton instance
const userModel = new UserModel();

// Export individual functions for convenience
module.exports = {
  getProfile: shopDomain => userModel.getProfile(shopDomain),
  upsertProfile: (shopDomain, profileData) => userModel.upsertProfile(shopDomain, profileData),
  updateAccount: (shopDomain, accountData) => userModel.updateAccount(shopDomain, accountData),
  updatePreferences: (shopDomain, preferences) =>
    userModel.updatePreferences(shopDomain, preferences),
};
