/**
 * Database Migration Runner
 *
 * Runs SQL migrations to set up the database schema
 */

const fs = require('fs');
const path = require('path');
// Load .env from project root (one level up from backend)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../src/utils/database');

async function runMigrations() {
  console.log('🔄 Running database migrations...');

  const migrationsDir = path.join(__dirname);
  const files = fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    console.log(`  Running ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      await query(sql);
      console.log(`  ✅ ${file} completed`);
    } catch (error) {
      console.error(`  ❌ Error in ${file}:`, error.message);
      throw error;
    }
  }

  console.log('✅ All migrations completed successfully!');
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
