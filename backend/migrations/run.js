/**
 * Database Migration Runner
 *
 * Runs only .sql files in this directory, in numeric order. Tracks applied
 * migrations in schema_migrations so already-applied files are skipped
 * (safe for repeated deploys). Any .js files here are legacy one-off scripts
 * and are not run by this runner.
 */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
// Load .env from project root (one level up from backend)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../src/utils/database');

const SCHEMA_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

async function runMigrations() {
  console.log('🔄 Running database migrations...');

  await query(SCHEMA_MIGRATIONS_TABLE);

  const migrationsDir = path.join(__dirname);
  const files = fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0', 10);
      if (numA !== numB) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });

  const appliedResult = await query('SELECT name FROM schema_migrations');
  const applied = new Set((appliedResult.rows || []).map(r => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ⏭️  ${file} (already applied)`);
      continue;
    }
    console.log(`  Running ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      await query(sql);
      await query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      applied.add(file);
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
