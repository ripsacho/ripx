#!/usr/bin/env node
/**
 * Ensure Super Admin – create or accept the first super admin user from the database.
 *
 * Use on server setup so the first admin can log in and accept others without
 * needing an existing admin to approve them. Reads RIPX_SUPERADMIN_EMAIL or
 * RIPX_ADMIN_EMAIL (first address if comma-separated), then:
 * - If the user exists: sets status='accepted', email_verified_at and accepted_at
 *   to NOW() if not set, role='superadmin', accepted_by='system'.
 * - If the user does not exist: inserts a new user with status='accepted',
 *   role='superadmin', email_verified_at/accepted_at/accepted_by set.
 * - Ensures the user has an account (account_id) so they can use the app.
 *
 * Usage:
 *   Set RIPX_SUPERADMIN_EMAIL=admin@example.com (or RIPX_ADMIN_EMAIL) in .env
 *   npm run ensure-superadmin
 *   node backend/scripts/ensureSuperAdmin.js
 *
 * Manual DB alternative (accept and set superadmin for an existing user by email):
 *   UPDATE users
 *   SET status = 'accepted',
 *       email_verified_at = COALESCE(email_verified_at, NOW()),
 *       accepted_at = COALESCE(accepted_at, NOW()),
 *       accepted_by = 'database',
 *       role = 'superadmin',
 *       updated_at = NOW()
 *   WHERE LOWER(TRIM(email)) = LOWER('your-admin@example.com');
 */
/* eslint-disable no-console */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { query, closeDatabase } = require('../src/utils/database');
const standaloneUser = require('../src/models/standaloneUser');

function getSuperAdminEmail() {
  const fromSuper = process.env.RIPX_SUPERADMIN_EMAIL;
  if (fromSuper && typeof fromSuper === 'string') {
    const e = fromSuper.split(',')[0].trim().toLowerCase();
    if (e) {return e;}
  }
  const fromAdmin = process.env.RIPX_ADMIN_EMAIL;
  if (fromAdmin && typeof fromAdmin === 'string') {
    const e = fromAdmin.split(',')[0].trim().toLowerCase();
    if (e) {return e;}
  }
  return null;
}

async function ensureSuperAdmin() {
  const email = getSuperAdminEmail();
  if (!email) {
    console.log(
      'RIPX_SUPERADMIN_EMAIL (or RIPX_ADMIN_EMAIL) not set. Set one in .env to bootstrap the first super admin.'
    );
    return;
  }

  const existing = await standaloneUser.getByEmail(email);

  if (existing) {
    await query(
      `UPDATE users SET
        status = 'accepted',
        email_verified_at = COALESCE(email_verified_at, NOW()),
        accepted_at = COALESCE(accepted_at, NOW()),
        accepted_by = COALESCE(accepted_by, 'system'),
        role = 'superadmin',
        updated_at = NOW()
       WHERE id = $1`,
      [existing.id]
    );
    console.log(`Updated user ${email} to accepted and superadmin.`);
  } else {
    try {
      await query(
        `INSERT INTO users (email, status, email_verified_at, accepted_at, accepted_by, role, created_at, updated_at)
         VALUES ($1, 'accepted', NOW(), NOW(), 'system', 'superadmin', NOW(), NOW())`,
        [email]
      );
      console.log(`Created super admin user ${email}.`);
    } catch (err) {
      if (err.code === '23505') {
        const byEmail = await standaloneUser.getByEmail(email);
        if (byEmail) {
          await query(
            `UPDATE users SET status = 'accepted', email_verified_at = COALESCE(email_verified_at, NOW()),
             accepted_at = COALESCE(accepted_at, NOW()), accepted_by = 'system', role = 'superadmin', updated_at = NOW() WHERE id = $1`,
            [byEmail.id]
          );
          console.log(`Updated user ${email} to accepted and superadmin (after conflict).`);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  const user = await standaloneUser.getByEmail(email);
  if (user) {
    const { ensureAccountForUser } = standaloneUser;
    const accountResult = await ensureAccountForUser(user.id);
    if (accountResult) {
      if (accountResult.apiKey) {
        console.log('Account created; user can sign in and use the app.');
      } else {
        console.log('User already has an account.');
      }
    }
  }

  console.log('Super admin bootstrap done. You can sign in with', email);
}

async function run() {
  try {
    await ensureSuperAdmin();
  } catch (err) {
    console.error('ensureSuperAdmin failed:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => {});
    process.exit(process.exitCode ?? 0);
  }
}

run();
