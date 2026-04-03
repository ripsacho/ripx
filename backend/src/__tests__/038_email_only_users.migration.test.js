const fs = require('fs');
const path = require('path');

describe('migration 038_email_only_users.sql', () => {
  let sql;

  beforeAll(() => {
    const migrationPath = path.resolve(__dirname, '../../migrations/038_email_only_users.sql');
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('links tenants by normalized domain (case/whitespace insensitive)', () => {
    expect(sql).toMatch(/WHERE\s+LOWER\(TRIM\(domain\)\)\s*=\s*LOWER\(TRIM\(r\.shop_domain\)\)/i);
  });

  it('merges duplicate user_domain_access rows without unique conflicts', () => {
    expect(sql).toMatch(/INSERT\s+INTO\s+user_domain_access/i);
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*user_id\s*,\s*tenant_id\s*\)/i);
    expect(sql).toMatch(/DO\s+UPDATE\s+SET/i);
  });
});
