#!/usr/bin/env node

require('dotenv').config();

const { query, closeDatabase } = require('../src/utils/database');

const analyze = process.argv.includes('--analyze');
const args = process.argv.slice(2);
const domainArg =
  args.find(arg => arg.startsWith('--domain='))?.split('=')[1] ||
  args.find(arg => arg.startsWith('--shop='))?.split('=')[1] ||
  args.find(arg => arg && !arg.startsWith('--'));
let shopDomain = domainArg || process.env.RIPX_EXPLAIN_SHOP_DOMAIN || process.env.SHOP_DOMAIN;
const testId = process.env.RIPX_EXPLAIN_TEST_ID || process.env.TEST_ID;
const eventNames = (process.env.RIPX_EXPLAIN_EVENT_NAMES || 'page_view,purchase,add_to_cart')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean);

function explainPrefix() {
  return analyze
    ? 'EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)'
    : 'EXPLAIN (BUFFERS, VERBOSE, FORMAT TEXT)';
}

async function printPlan(title, sql, params) {
  console.log(`\n=== ${title} ===`);
  const result = await query(`${explainPrefix()} ${sql}`, params);
  (result.rows || []).forEach(row => {
    console.log(row['QUERY PLAN']);
  });
}

async function resolveShopDomain() {
  if (shopDomain) {
    return shopDomain;
  }

  try {
    const result = await query(`
      SELECT domain
      FROM (
        SELECT domain FROM tenants WHERE domain IS NOT NULL
        UNION
        SELECT shop_domain AS domain FROM shop_settings WHERE shop_domain IS NOT NULL
      ) candidates
      ORDER BY domain
      LIMIT 10
    `);
    const domains = (result.rows || []).map(row => row.domain).filter(Boolean);
    if (domains.length === 1) {
      console.log(`Using detected shop domain: ${domains[0]}`);
      return domains[0];
    }
    if (domains.length > 1) {
      throw new Error(
        [
          `Multiple shop domains found: ${domains.join(', ')}`,
          `Run: npm run verify:analytics-queries -- --domain=${domains[0]}`,
          'Or set RIPX_EXPLAIN_SHOP_DOMAIN in your environment.',
        ].join('\n')
      );
    }
  } catch (error) {
    if (error.message.includes('RIPX_EXPLAIN_SHOP_DOMAIN')) {
      throw error;
    }
  }

  throw new Error(
    [
      'No shop domain was detected for analytics query verification.',
      'Run: npm run verify:analytics-queries -- --domain=your-store.myshopify.com',
      'Or set RIPX_EXPLAIN_SHOP_DOMAIN in your environment.',
    ].join('\n')
  );
}

async function run() {
  shopDomain = await resolveShopDomain();

  await printPlan(
    'Goal metric observed counts from rollups',
    `
      SELECT
        rollups.event_name,
        SUM(rollups.event_count)::bigint AS count,
        MAX(rollups.last_seen_at) AS last_seen_at
      FROM goal_metric_event_rollups rollups
      WHERE (
        rollups.shop_domain = $1
        OR rollups.tenant_id = (SELECT id FROM tenants WHERE domain = $1 LIMIT 1)
      )
        AND rollups.event_name = ANY($2::text[])
      GROUP BY rollups.event_name
    `,
    [shopDomain, eventNames]
  );

  await printPlan(
    'Raw event fallback observed counts',
    `
      SELECT e.event_name, COUNT(*)::int AS count, MAX(e.created_at) AS last_seen_at
      FROM events e
      WHERE (
        e.shop_domain = $1
        OR e.tenant_id = (SELECT id FROM tenants WHERE domain = $1 LIMIT 1)
      )
        AND e.event_name IS NOT NULL
        AND e.event_name <> ''
        AND e.event_name = ANY($2::text[])
      GROUP BY e.event_name
    `,
    [shopDomain, eventNames]
  );

  if (testId) {
    await printPlan(
      'Batched secondary custom event metrics',
      `
        SELECT
          e.event_name,
          e.variant_id,
          COUNT(DISTINCT e.user_id) AS count,
          COALESCE(SUM(e.event_value), 0) AS sum
        FROM events e
        WHERE e.test_id = $1
          AND e.shop_domain = $2
          AND e.event_type = 'custom'
          AND e.event_name = ANY($3::text[])
        GROUP BY e.event_name, e.variant_id
      `,
      [testId, shopDomain, eventNames]
    );
  } else {
    console.log('\nSkipping test-specific metrics plan. Set RIPX_EXPLAIN_TEST_ID to include it.');
  }
}

run()
  .catch(error => {
    console.error('Analytics query verification failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
