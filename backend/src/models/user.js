/**
 * User Model
 *
 * Email-only identity: users are identified by email. Resolution by domain (store context)
 * is via tenant -> account_id -> user. Database operations for profile, account, preferences.
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { getTenantByDomain } = require('./tenant');

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
   * Get user by email (primary identity). Used for email session and /me.
   */
  async getByEmail(email) {
    if (!email || typeof email !== 'string') {
      return null;
    }
    const e = email.trim().toLowerCase();
    if (!e) {
      return null;
    }
    try {
      const result = await query(
        `SELECT id, email, status, account_id, profile, account, preferences, role, created_at, updated_at
         FROM users WHERE LOWER(TRIM(email)) = $1`,
        [e]
      );
      return result.rows[0] || null;
    } catch (err) {
      if (err.message && err.message.includes('does not exist')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Get user by account ID (for resolving user from tenant/domain context).
   */
  async getByAccountId(accountId) {
    if (!accountId) {
      return null;
    }
    try {
      const result = await query(
        `SELECT id, email, status, account_id, profile, account, preferences, role, created_at, updated_at
         FROM users WHERE account_id = $1`,
        [accountId]
      );
      return result.rows[0] || null;
    } catch (err) {
      if (err.message && err.message.includes('does not exist')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Get user by domain (store context): tenant by domain -> user by tenant.account_id.
   * Returns null if no tenant or tenant has no account_id.
   */
  async getByDomain(domain) {
    if (!domain) {
      return null;
    }
    const tenant = await getTenantByDomain(domain);
    if (!tenant || !tenant.account_id) {
      return null;
    }
    return this.getByAccountId(tenant.account_id);
  }

  /**
   * Get user profile by domain (store context). Resolves user via tenant -> account -> user.
   */
  async getProfile(shopDomain) {
    try {
      const user = await this.getByDomain(shopDomain);
      if (!user) {
        return null;
      }

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
      if (error.message && error.message.includes('does not exist')) {
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
   * Create or update user profile by domain. User must already be linked (tenant has account_id).
   * If no user for domain, returns null (caller should prompt login / "Add this store").
   */
  async upsertProfile(shopDomain, profileData) {
    try {
      const user = await this.getByDomain(shopDomain);
      if (!user) {
        return null;
      }

      const result = await query(
        'UPDATE users SET profile = $1, updated_at = NOW() WHERE id = $2 RETURNING profile, updated_at',
        [JSON.stringify(profileData), user.id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return {
        profile: safeParseJSON(result.rows[0].profile, {}),
        updatedAt: result.rows[0].updated_at,
      };
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        logger.warn('Users table does not exist', { shopDomain });
        throw new Error('Users table does not exist. Please run migrations.');
      }
      throw error;
    }
  }

  /**
   * Update user account (JSON) by domain. User must be linked to domain.
   */
  async updateAccount(shopDomain, accountData) {
    try {
      const user = await this.getByDomain(shopDomain);
      if (!user) {
        return null;
      }

      const result = await query(
        'UPDATE users SET account = $1, updated_at = NOW() WHERE id = $2 RETURNING account, updated_at',
        [JSON.stringify(accountData), user.id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return {
        account: safeParseJSON(result.rows[0].account, {}),
        updatedAt: result.rows[0].updated_at,
      };
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        logger.warn('Users table does not exist', { shopDomain });
        throw new Error('Users table does not exist. Please run migrations.');
      }
      throw error;
    }
  }

  /**
   * Update user preferences by domain. User must be linked to domain.
   */
  async updatePreferences(shopDomain, preferences) {
    try {
      const user = await this.getByDomain(shopDomain);
      if (!user) {
        return null;
      }

      const result = await query(
        'UPDATE users SET preferences = $1, updated_at = NOW() WHERE id = $2 RETURNING preferences, updated_at',
        [JSON.stringify(preferences), user.id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      return {
        preferences: safeParseJSON(result.rows[0].preferences, {}),
        updatedAt: result.rows[0].updated_at,
      };
    } catch (error) {
      if (error.message && error.message.includes('does not exist')) {
        logger.warn('Users table does not exist', { shopDomain });
        throw new Error('Users table does not exist. Please run migrations.');
      }
      throw error;
    }
  }

  /**
   * Get user role and status by domain or email (email-only identity: both use same resolution).
   * If identifier contains '@', resolve by email; otherwise by domain (tenant -> account -> user).
   */
  async getRoleAndStatus(identifier) {
    try {
      const user =
        identifier && String(identifier).includes('@')
          ? await this.getByEmail(identifier)
          : await this.getByDomain(identifier);
      if (!user) {
        return null;
      }
      return {
        role: user.role ?? null,
        status: user.status ?? 'active',
      };
    } catch (err) {
      if (err.message && err.message.includes('does not exist')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Set user status (active | locked | suspended) by domain.
   */
  async setStatus(shopDomain, status) {
    const user = await this.getByDomain(shopDomain);
    if (!user) {
      return false;
    }
    const result = await query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [status, user.id]
    );
    return result.rows.length > 0;
  }

  /**
   * Set user role by identifier (email or domain). For email users pass email; for store pass domain.
   */
  async setRole(identifier, role) {
    const user =
      identifier && String(identifier).includes('@')
        ? await this.getByEmail(identifier)
        : await this.getByDomain(identifier);
    if (!user) {
      return false;
    }
    const result = await query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
      [role, user.id]
    );
    return result.rows.length > 0;
  }
}

// Export singleton instance
const userModel = new UserModel();

// Export individual functions for convenience
module.exports = {
  getByEmail: email => userModel.getByEmail(email),
  getByAccountId: accountId => userModel.getByAccountId(accountId),
  getByDomain: domain => userModel.getByDomain(domain),
  getProfile: shopDomain => userModel.getProfile(shopDomain),
  upsertProfile: (shopDomain, profileData) => userModel.upsertProfile(shopDomain, profileData),
  updateAccount: (shopDomain, accountData) => userModel.updateAccount(shopDomain, accountData),
  updatePreferences: (shopDomain, preferences) =>
    userModel.updatePreferences(shopDomain, preferences),
  getRoleAndStatus: shopDomain => userModel.getRoleAndStatus(shopDomain),
  setStatus: (shopDomain, status) => userModel.setStatus(shopDomain, status),
  setRole: (shopDomain, role) => userModel.setRole(shopDomain, role),
};
