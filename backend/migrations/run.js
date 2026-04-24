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
const { query, closeDatabase } = require('../src/utils/database');
const PGVECTOR_MIGRATION_FILE = '050_pgvector_support_kb.sql';

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

  // Recovery for legacy behavior:
  // older runner versions could mark 050 as applied even when pgvector was unavailable.
  // If the migration is marked but support_kb_chunks does not exist, unmark so it can be retried.
  if (applied.has(PGVECTOR_MIGRATION_FILE)) {
    const kbTableCheck = await query(
      "SELECT to_regclass('public.support_kb_chunks') AS support_kb_chunks_table"
    );
    const hasKbTable = Boolean(kbTableCheck.rows?.[0]?.support_kb_chunks_table);
    if (!hasKbTable) {
      console.warn(
        `  ⚠️  ${PGVECTOR_MIGRATION_FILE} was marked applied but support_kb_chunks is missing; resetting migration state.`
      );
      await query('DELETE FROM schema_migrations WHERE name = $1', [PGVECTOR_MIGRATION_FILE]);
      applied.delete(PGVECTOR_MIGRATION_FILE);
    }
  }

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
      const isPgvectorUnavailable =
        file.startsWith('050_') &&
        (error.code === '0A000' ||
          (error.message && error.message.includes('extension "vector" is not available')));
      if (isPgvectorUnavailable) {
        console.warn(`  ⚠️  ${file} skipped: pgvector extension not installed.`);
        console.warn('     To enable RAG support: install pgvector, then re-run npm run migrate.');
        console.warn('     macOS (Homebrew): brew install pgvector');
        console.warn('     See backend/migrations/050_pgvector_support_kb.sql or docs for more.');
        console.warn(
          '     Migration state left as pending so it can be applied automatically once pgvector is installed.'
        );
        continue;
      }
      console.error(`  ❌ Error in ${file}:`, error.message);
      throw error;
    }
  }

  console.log('✅ All migrations completed successfully!');
}

// Run if called directly
if (require.main === module) {
  (async () => {
    let exitCode = 0;
    try {
      await runMigrations();
    } catch (error) {
      console.error('Migration failed:', error);
      exitCode = 1;
    } finally {
      try {
        await closeDatabase();
      } catch (closeError) {
        console.error('Failed to close database connections:', closeError);
        exitCode = 1;
      }
      process.exit(exitCode);
    }
  })();
}

module.exports = { runMigrations };
