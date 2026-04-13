/**
 * Migration runner regression tests.
 *
 * Covers pgvector migration behavior:
 * - recovery when 050 was falsely marked applied but table is missing
 * - do not mark 050 applied when pgvector extension is unavailable
 */

function loadRunnerWithMocks({ queryImpl, readdirSync, readFileSync }) {
  jest.resetModules();

  jest.doMock('dotenv', () => ({ config: jest.fn() }));
  jest.doMock('fs', () => ({
    readdirSync,
    readFileSync,
  }));
  jest.doMock('../../src/utils/database', () => ({
    query: jest.fn(queryImpl),
  }));

  // eslint-disable-next-line global-require
  const runner = require('../../migrations/run');
  // eslint-disable-next-line global-require
  const db = require('../../src/utils/database');
  return { runMigrations: runner.runMigrations, queryMock: db.query };
}

describe('backend/migrations/run.js', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('recovers false-applied 050 by unmarking and rerunning migration', async () => {
    const migrationSql = 'MIGRATION_050_SQL';
    const { runMigrations, queryMock } = loadRunnerWithMocks({
      readdirSync: jest.fn(() => ['050_pgvector_support_kb.sql']),
      readFileSync: jest.fn(() => migrationSql),
      queryImpl: (sql, _params) => {
        if (String(sql).includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
          return { rows: [] };
        }
        if (sql === 'SELECT name FROM schema_migrations') {
          return { rows: [{ name: '050_pgvector_support_kb.sql' }] };
        }
        if (String(sql).includes("SELECT to_regclass('public.support_kb_chunks')")) {
          return { rows: [{ support_kb_chunks_table: null }] };
        }
        if (sql === 'DELETE FROM schema_migrations WHERE name = $1') {
          return { rowCount: 1, rows: [] };
        }
        if (sql === migrationSql) {
          return { rows: [] };
        }
        if (sql === 'INSERT INTO schema_migrations (name) VALUES ($1)') {
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected SQL in test: ${sql}`);
      },
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runMigrations();

    expect(queryMock).toHaveBeenCalledWith('DELETE FROM schema_migrations WHERE name = $1', [
      '050_pgvector_support_kb.sql',
    ]);
    expect(queryMock).toHaveBeenCalledWith(migrationSql);
    expect(queryMock).toHaveBeenCalledWith('INSERT INTO schema_migrations (name) VALUES ($1)', [
      '050_pgvector_support_kb.sql',
    ]);
    expect(warnSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
  });

  test('does not mark 050 applied when pgvector extension is unavailable', async () => {
    const migrationSql = 'MIGRATION_050_SQL';
    const pgvectorError = Object.assign(new Error('extension "vector" is not available'), {
      code: '0A000',
    });
    const { runMigrations, queryMock } = loadRunnerWithMocks({
      readdirSync: jest.fn(() => ['050_pgvector_support_kb.sql']),
      readFileSync: jest.fn(() => migrationSql),
      queryImpl: sql => {
        if (String(sql).includes('CREATE TABLE IF NOT EXISTS schema_migrations')) {
          return { rows: [] };
        }
        if (sql === 'SELECT name FROM schema_migrations') {
          return { rows: [] };
        }
        if (sql === migrationSql) {
          throw pgvectorError;
        }
        if (sql === 'INSERT INTO schema_migrations (name) VALUES ($1)') {
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected SQL in test: ${sql}`);
      },
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    await runMigrations();

    const insertCalls = queryMock.mock.calls.filter(
      ([sql]) => sql === 'INSERT INTO schema_migrations (name) VALUES ($1)'
    );
    expect(insertCalls).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});
