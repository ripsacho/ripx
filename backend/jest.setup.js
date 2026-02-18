/**
 * Jest setup - runs before tests
 * Sets DATABASE_URL to avoid initDatabase error when loading modules that depend on db
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://localhost:5432/ripx_test_placeholder';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
