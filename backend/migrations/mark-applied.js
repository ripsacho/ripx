/**
 * One-off: Mark all current .sql migrations as applied in schema_migrations.
 * Run this once on a database that already had migrations applied before
 * migration tracking was introduced, so future `node migrations/run.js`
 * runs skip them instead of re-executing.
 *
 * Usage: node backend/migrations/mark-applied.js
 */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../src/utils/database');

async function markApplied() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const migrationsDir = path.join(__dirname);
  const files = fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0', 10);
      if (numA !== numB) {return numA - numB;}
      return a.localeCompare(b);
    });
  for (const file of files) {
    await query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [
      file,
    ]);
    console.log('  Marked applied:', file);
  }
  console.log('Done. Total files marked:', files.length);
}

markApplied()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
