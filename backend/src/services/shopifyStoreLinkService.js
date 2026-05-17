/**
 * Link a Shopify store (tenant + OAuth session) to the logged-in user's account.
 */

const { withTransaction } = require('../utils/database');
const { getTenantByDomain } = require('../models/tenant');
const { getShopSession } = require('../models/shopSession');
const userModel = require('../models/user');
const standaloneUser = require('../models/standaloneUser');
const { isUserStatusAllowedForSession } = require('../constants');
const emailVerificationService = require('./emailVerificationService');

/**
 * @param {{ shopDomain: string, email: string }} input
 * @returns {Promise<{ linked: boolean, storeLinkedToAnother: boolean, reason?: string }>}
 */
async function linkShopifyStoreToUserAccount({ shopDomain, email }) {
  const normalizedShop = String(shopDomain || '')
    .trim()
    .toLowerCase();
  const stateEmail = String(email || '')
    .trim()
    .toLowerCase();

  if (!normalizedShop || !normalizedShop.includes('.myshopify.com')) {
    return { linked: false, storeLinkedToAnother: false, reason: 'invalid_shop' };
  }
  if (!stateEmail || !emailVerificationService.isValidEmail(stateEmail)) {
    return { linked: false, storeLinkedToAnother: false, reason: 'invalid_email' };
  }

  const session = await getShopSession(normalizedShop);
  if (!session?.access_token) {
    return { linked: false, storeLinkedToAnother: false, reason: 'no_shopify_session' };
  }

  const tenant = await getTenantByDomain(normalizedShop);
  if (!tenant) {
    return { linked: false, storeLinkedToAnother: false, reason: 'no_tenant' };
  }

  const user = await userModel.getByEmail(stateEmail);
  if (!user || !isUserStatusAllowedForSession(user.status)) {
    return { linked: false, storeLinkedToAnother: false, reason: 'user_not_allowed' };
  }

  const { accountId } = (await standaloneUser.ensureAccountForUser(user.id)) || {};
  if (!accountId) {
    return { linked: false, storeLinkedToAnother: false, reason: 'no_account' };
  }

  if (tenant.account_id !== null && tenant.account_id !== accountId) {
    return { linked: false, storeLinkedToAnother: true, reason: 'linked_to_another_account' };
  }

  const didLink = await withTransaction(async client => {
    const row = await client.query(
      'SELECT id, account_id FROM tenants WHERE domain = $1 FOR UPDATE',
      [normalizedShop]
    );
    const t = row.rows[0];
    if (!t) {
      return false;
    }
    if (t.account_id !== null && t.account_id !== accountId) {
      return false;
    }
    if (t.account_id) {
      const role = t.account_id === accountId ? 'owner' : 'member';
      await client.query(
        `INSERT INTO user_domain_access (user_id, tenant_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = $3, updated_at = NOW()`,
        [user.id, t.id, role]
      );
    } else {
      await client.query('UPDATE tenants SET account_id = $1, updated_at = NOW() WHERE id = $2', [
        accountId,
        t.id,
      ]);
      await client.query(
        `INSERT INTO user_domain_access (user_id, tenant_id, role) VALUES ($1, $2, 'owner')
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'owner', updated_at = NOW()`,
        [user.id, t.id]
      );
    }
    return true;
  });

  return {
    linked: Boolean(didLink),
    storeLinkedToAnother: false,
    reason: didLink ? 'linked' : 'link_failed',
  };
}

module.exports = {
  linkShopifyStoreToUserAccount,
};
