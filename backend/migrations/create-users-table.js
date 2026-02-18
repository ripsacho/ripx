/**
 * Quick script to create users table
 * Run this when the server is running or DATABASE_URL is set
 */
/* eslint-disable no-console */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../src/utils/database');

async function createUsersTable() {
  try {
    console.log('🔄 Creating users table...');

    const sql = `
      -- Users table (stores user profile, account, and preferences)
      CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          shop_domain VARCHAR(255) NOT NULL UNIQUE,
          profile JSONB DEFAULT '{}',
          account JSONB DEFAULT '{}',
          preferences JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Index for shop_domain lookups
      CREATE INDEX IF NOT EXISTS idx_users_shop_domain ON users(shop_domain);

      -- Drop trigger if it exists, then create it
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    await query(sql);
    console.log('✅ Users table created successfully!');
    process.exit(0);
  } catch (error) {
    if (
      error.message.includes('does not exist') &&
      error.message.includes('update_updated_at_column')
    ) {
      console.log('⚠️  Note: update_updated_at_column function may need to be created first.');
      console.log('   Run the initial migrations first, or create the function manually.');
    }
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createUsersTable();
