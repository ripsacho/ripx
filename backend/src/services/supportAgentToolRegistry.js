const { query } = require('../utils/database');
const { listGoalMetricDefinitions } = require('../models/goalMetricDefinition');
const { getTestById } = require('../models/test');
const { getTenantByDomain } = require('../models/tenant');
const {
  buildTestCheckoutReadiness,
  supportsCheckoutReadiness,
} = require('./checkoutReadinessService');
const { runActivationPreflight } = require('./testActivationService');
const { getShopSession } = require('../models/shopSession');
const { RISK_LEVELS, canAutoExecuteTool, buildToolPolicy } = require('./supportAgentPolicyService');
const { redactForLlm } = require('./supportAgentRedactionService');

function buildToolResult(tool, status, data, error = null) {
  return redactForLlm({
    tool,
    status,
    data: data || null,
    error: error ? String(error).slice(0, 300) : null,
  });
}

async function getDashboardStats({ shopDomain }) {
  if (!shopDomain) {
    return buildToolResult('get_dashboard_stats', 'skipped', null, 'Shop domain required');
  }
  const testsSql = `
    SELECT
      COUNT(*)::int as total_tests,
      COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'running')::int as active_tests
    FROM tests
    WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
  `;
  const eventsSql = `
    SELECT 
      COALESCE(COUNT(DISTINCT e.user_id), 0)::bigint as total_conversions,
      COALESCE(SUM(e.event_value), 0)::float as total_revenue
    FROM events e
    INNER JOIN test_assignments ta
      ON ta.test_id = e.test_id AND ta.user_id = e.user_id
      AND LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM(e.shop_domain))
      AND ta.variant_id = e.variant_id
    WHERE LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($1))
      AND e.event_type = 'conversion'
  `;
  const visitorsSql = `
    SELECT COALESCE(COUNT(DISTINCT user_id), 0)::bigint as total_visitors
    FROM test_assignments
    WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
  `;
  const [testsRes, eventsRes, visitorsRes] = await Promise.all([
    query(testsSql, [shopDomain]),
    query(eventsSql, [shopDomain]),
    query(visitorsSql, [shopDomain]),
  ]);
  const visitors = parseInt(visitorsRes.rows?.[0]?.total_visitors, 10) || 0;
  const conversions = parseInt(eventsRes.rows?.[0]?.total_conversions, 10) || 0;
  return buildToolResult('get_dashboard_stats', 'success', {
    total_tests: parseInt(testsRes.rows?.[0]?.total_tests, 10) || 0,
    active_tests: parseInt(testsRes.rows?.[0]?.active_tests, 10) || 0,
    total_visitors: visitors,
    total_conversions: conversions,
    total_revenue: parseFloat(eventsRes.rows?.[0]?.total_revenue) || 0,
    avg_conversion_rate: visitors > 0 ? (conversions / visitors) * 100 : 0,
  });
}

async function listTestsSummary({ shopDomain }) {
  if (!shopDomain) {
    return buildToolResult('list_tests_summary', 'skipped', null, 'Shop domain required');
  }
  const result = await query(
    `SELECT id, name, type, status, created_at, updated_at
     FROM tests
     WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 8`,
    [shopDomain]
  );
  const statusResult = await query(
    `SELECT LOWER(TRIM(status)) AS status, COUNT(*)::int AS count
     FROM tests
     WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
     GROUP BY LOWER(TRIM(status))`,
    [shopDomain]
  );
  return buildToolResult('list_tests_summary', 'success', {
    status_counts: (statusResult.rows || []).reduce((acc, row) => {
      acc[row.status || 'unknown'] = row.count;
      return acc;
    }, {}),
    recent_tests: (result.rows || []).map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      updated_at: row.updated_at,
    })),
  });
}

async function listGoalMetricsSummary({ shopDomain }) {
  if (!shopDomain) {
    return buildToolResult('list_goal_metrics_summary', 'skipped', null, 'Shop domain required');
  }
  const definitions = await listGoalMetricDefinitions(shopDomain);
  return buildToolResult('list_goal_metrics_summary', 'success', {
    count: definitions.length,
    definitions: definitions.slice(0, 10).map(definition => ({
      id: definition.id,
      name: definition.name,
      event_name: definition.event_name,
      trigger_type: definition.trigger_type,
      metric_role: definition.metric_role,
      has_custom_javascript: Boolean(definition.trigger_config?.custom_javascript),
      trigger_config: {
        selector: definition.trigger_config?.selector || '',
        url_pattern: definition.trigger_config?.url_pattern || '',
        link_kind: definition.trigger_config?.link_kind || '',
        custom_javascript: definition.trigger_config?.custom_javascript || '',
      },
    })),
  });
}

function getCurrentContext({ context }) {
  return buildToolResult('get_current_context', 'success', context);
}

async function getInstallationSummary({ shopDomain }) {
  if (!shopDomain) {
    return buildToolResult('get_installation_summary', 'skipped', null, 'Shop domain required');
  }
  const tenant = await getTenantByDomain(shopDomain);
  const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  const isShopify = /\.myshopify\.com$/i.test(shopDomain);
  return buildToolResult('get_installation_summary', 'success', {
    domain: shopDomain,
    platform: tenant?.platform || (isShopify ? 'shopify' : 'standalone'),
    script_verified: Boolean(tenant?.domain_verified_at),
    app_url_configured: Boolean(appUrl),
    script_url: isShopify
      ? `https://${shopDomain}/apps/ripx/script.js`
      : appUrl
        ? `${appUrl}/api/track/script.js?site=${encodeURIComponent(shopDomain)}`
        : null,
  });
}

async function getFocusedTestSummary({ shopDomain, context }) {
  const testId = context?.route_context?.test_id;
  if (!shopDomain || !testId) {
    return buildToolResult(
      'get_focused_test_summary',
      'skipped',
      null,
      !shopDomain ? 'Shop domain required' : 'No focused test id in route context'
    );
  }
  const test = await getTestById(testId, shopDomain);
  if (!test) {
    return buildToolResult('get_focused_test_summary', 'not_found', null, 'Test not found');
  }
  return buildToolResult('get_focused_test_summary', 'success', {
    id: test.id,
    name: test.name,
    type: test.type,
    status: test.status,
    traffic_allocation: test.traffic_allocation,
    start_date: test.start_date || test.started_at || null,
    end_date: test.end_date || test.stopped_at || null,
    variant_count: Array.isArray(test.variants) ? test.variants.length : 0,
    has_visual_editor_rules: Array.isArray(test.variants)
      ? test.variants.some(variant => Array.isArray(variant?.config?.visual_editor_rules))
      : false,
  });
}

async function getFocusedTestReadiness({ shopDomain, context, req }) {
  const testId = context?.route_context?.test_id;
  if (!shopDomain || !testId) {
    return buildToolResult(
      'get_focused_test_readiness',
      'skipped',
      null,
      !shopDomain ? 'Shop domain required' : 'No focused test id in route context'
    );
  }
  const test = await getTestById(testId, shopDomain);
  if (!test) {
    return buildToolResult('get_focused_test_readiness', 'not_found', null, 'Test not found');
  }
  const preflight = await runActivationPreflight(test, shopDomain);
  let checkoutReadiness = null;
  if (supportsCheckoutReadiness(test)) {
    const fallbackSession = await getShopSession(shopDomain);
    checkoutReadiness = await buildTestCheckoutReadiness({
      test,
      shopDomain,
      accessToken: req?.shopifyAccessToken || fallbackSession?.access_token || '',
    });
  }
  return buildToolResult('get_focused_test_readiness', 'success', {
    preflight: {
      ok: Boolean(preflight?.ok),
      errors: Array.isArray(preflight?.errors) ? preflight.errors.slice(0, 5) : [],
      warnings: Array.isArray(preflight?.warnings) ? preflight.warnings.slice(0, 5) : [],
    },
    checkout_readiness: checkoutReadiness
      ? {
          status: checkoutReadiness.summary?.status || checkoutReadiness.support?.level || null,
          headline: checkoutReadiness.summary?.headline || null,
          next_action: checkoutReadiness.summary?.next_action || null,
          blockers: checkoutReadiness.summary?.blockers || 0,
          warnings: checkoutReadiness.summary?.warnings || 0,
        }
      : null,
  });
}

const TOOL_REGISTRY = {
  get_current_context: {
    name: 'get_current_context',
    risk: RISK_LEVELS.READ_ONLY,
    description: 'Summarize the authenticated actor, selected store, and route context.',
    execute: getCurrentContext,
  },
  get_dashboard_stats: {
    name: 'get_dashboard_stats',
    risk: RISK_LEVELS.READ_ONLY,
    description: 'Read current store dashboard aggregate counts.',
    execute: getDashboardStats,
  },
  get_installation_summary: {
    name: 'get_installation_summary',
    risk: RISK_LEVELS.READ_ONLY,
    description: 'Read current store installation and script verification status.',
    execute: getInstallationSummary,
  },
  list_tests_summary: {
    name: 'list_tests_summary',
    risk: RISK_LEVELS.READ_ONLY,
    description: 'Read recent tests and status counts for the selected store.',
    execute: listTestsSummary,
  },
  get_focused_test_summary: {
    name: 'get_focused_test_summary',
    risk: RISK_LEVELS.READ_ONLY,
    description: 'Read focused test details from the current route context.',
    execute: getFocusedTestSummary,
  },
  get_focused_test_readiness: {
    name: 'get_focused_test_readiness',
    risk: RISK_LEVELS.READ_ONLY,
    description: 'Read preflight and checkout readiness for the focused test.',
    execute: getFocusedTestReadiness,
  },
  list_goal_metrics_summary: {
    name: 'list_goal_metrics_summary',
    risk: RISK_LEVELS.READ_ONLY,
    description: 'Read goal metric definitions with custom JavaScript redacted.',
    execute: listGoalMetricsSummary,
  },
};

function getAvailableTools() {
  return Object.values(TOOL_REGISTRY).map(tool => ({
    name: tool.name,
    description: tool.description,
    ...buildToolPolicy(tool),
  }));
}

async function executeReadOnlyTools(toolNames, input) {
  const names = Array.isArray(toolNames) && toolNames.length ? toolNames : ['get_current_context'];
  const maxTools = Math.max(
    1,
    Math.min(parseInt(process.env.SUPPORT_AGENT_MAX_READ_TOOLS, 10) || 6, 12)
  );
  const uniqueNames = [...new Set(names)].slice(0, maxTools);
  const results = [];
  for (const name of uniqueNames) {
    const tool = TOOL_REGISTRY[name];
    if (!tool) {
      results.push(buildToolResult(name, 'error', null, 'Unknown tool'));
      continue;
    }
    if (!canAutoExecuteTool(tool)) {
      results.push(buildToolResult(name, 'blocked', null, 'Tool requires confirmation'));
      continue;
    }
    try {
      results.push(await tool.execute(input));
    } catch (error) {
      results.push(buildToolResult(name, 'error', null, error.message));
    }
  }
  return results;
}

function selectReadOnlyToolsForMessage(message, context = {}) {
  const text = String(message || '').toLowerCase();
  const tools = ['get_current_context'];
  if (/dashboard|stats|visitor|conversion|revenue|overview/.test(text)) {
    tools.push('get_dashboard_stats');
  }
  if (/install|setup|snippet|script|connected|app embed|proxy/.test(text)) {
    tools.push('get_installation_summary');
  }
  if (
    /test|experiment|ab test|a\/b|active|draft|running|checkout/.test(text) ||
    context.route_context?.test_id
  ) {
    tools.push('list_tests_summary');
  }
  if (context.route_context?.test_id) {
    tools.push('get_focused_test_summary');
  }
  if (/ready|readiness|preflight|blocked|blocker|checkout|launch|start/.test(text)) {
    tools.push('get_focused_test_readiness');
  }
  if (/goal|metric|event|conversion tracking|selector/.test(text)) {
    tools.push('list_goal_metrics_summary');
  }
  return [...new Set(tools)];
}

module.exports = {
  TOOL_REGISTRY,
  getAvailableTools,
  executeReadOnlyTools,
  selectReadOnlyToolsForMessage,
};
