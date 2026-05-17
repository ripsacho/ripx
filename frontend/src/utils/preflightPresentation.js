/**
 * User-facing launch preflight presentation (grouping, dedupe, short labels).
 */

import { formatPreflightCheckMessage } from './preflightHints';

const CHECK_TITLES = {
  guardrail_enabled: 'Auto-stop guardrail',
  shopify_oauth_health: 'Shopify app permissions',
  shopify_oauth_scopes: 'Shopify app permissions',
  storefront_runtime_ready: 'Storefront tracking script',
  pricing_storefront_surface_mapping: 'Theme price selectors',
  pricing_storefront_surface_coverage: 'Theme price selectors',
  checkout_launch_readiness: 'Checkout setup',
  canary_percent_valid: 'Canary traffic',
  canary_days_valid: 'Canary schedule',
  experiment_group_conflicts: 'Other running tests',
  target_overlap_conflicts: 'Overlapping tests',
};

const HIDDEN_OK_IDS = new Set([
  'test_status_startable',
  'variant_count',
  'traffic_allocation_sum',
  'canary_percent_valid',
  'canary_days_valid',
  'experiment_group_conflicts',
  'target_overlap_conflicts',
  'shopify_access_token_present',
]);

/** Shown in technical list only unless nothing else is wrong. */
const ADVISORY_ONLY_IDS = new Set(['guardrail_enabled']);

const PRIMARY_ISSUE_CAP = 4;

/** Lower rank = higher in the summary list. */
const ISSUE_RANK = {
  shopify_oauth_health: 10,
  shopify_oauth_scopes: 10,
  checkout_launch_readiness: 20,
  storefront_runtime_ready: 30,
  pricing_storefront_surface_mapping: 40,
  pricing_storefront_surface_coverage: 40,
  experiment_group_conflicts: 50,
  target_overlap_conflicts: 55,
  guardrail_enabled: 90,
};

export function preflightCheckTitle(check) {
  const id = String(check?.id || '').trim();
  if (CHECK_TITLES[id]) {
    return CHECK_TITLES[id];
  }
  return id.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

export function groupPreflightChecksBySeverity(checks) {
  const grouped = { errors: [], warnings: [], ok: [] };
  if (!Array.isArray(checks)) {
    return grouped;
  }
  checks.forEach(check => {
    const severity = String(check?.severity || 'ok').toLowerCase();
    if (severity === 'error') {
      grouped.errors.push(check);
    } else if (severity === 'warning') {
      grouped.warnings.push(check);
    } else {
      grouped.ok.push(check);
    }
  });
  return grouped;
}

function normalizeDedupeKey(check) {
  const id = String(check?.id || '').trim();
  if (id === 'shopify_oauth_scopes' || id === 'shopify_oauth_health') {
    return 'shopify_permissions';
  }
  if (id === 'pricing_storefront_surface_mapping' || id === 'pricing_storefront_surface_coverage') {
    return 'theme_price_selectors';
  }
  if (id === 'storefront_runtime_ready') {
    return 'storefront_runtime';
  }
  return id || String(check?.message || '').slice(0, 80);
}

export function dedupePreflightChecks(checks) {
  const seen = new Set();
  const out = [];
  (checks || []).forEach(check => {
    const key = normalizeDedupeKey(check);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push(check);
  });
  return out;
}

export function formatPreflightIssueLine(check) {
  const title = preflightCheckTitle(check);
  const detail = formatPreflightCheckMessage(check);
  if (!detail) {
    return title;
  }
  if (detail.toLowerCase().startsWith(title.toLowerCase())) {
    return detail;
  }
  return `${title}: ${detail}`;
}

function issueSortRank(check) {
  const id = String(check?.id || '').trim();
  const severity = String(check?.severity || 'ok').toLowerCase();
  const severityRank = severity === 'error' ? 0 : severity === 'warning' ? 1 : 2;
  const idRank = ISSUE_RANK[id] ?? 60;
  const advisoryRank = ADVISORY_ONLY_IDS.has(id) ? 1 : 0;
  return [severityRank, advisoryRank, idRank, id];
}

export function sortPreflightIssuesForDisplay(issues) {
  return [...(issues || [])].sort((a, b) => {
    const ra = issueSortRank(a);
    const rb = issueSortRank(b);
    for (let i = 0; i < ra.length; i += 1) {
      if (ra[i] !== rb[i]) {
        return ra[i] < rb[i] ? -1 : 1;
      }
    }
    return 0;
  });
}

function pickPrimaryIssues(issues) {
  const sorted = sortPreflightIssuesForDisplay(issues);
  const blocking = sorted.filter(check => String(check?.severity || '').toLowerCase() === 'error');
  const recommendations = sorted.filter(
    check =>
      String(check?.severity || '').toLowerCase() === 'warning' &&
      !ADVISORY_ONLY_IDS.has(String(check?.id || ''))
  );
  const advisory = sorted.filter(check => ADVISORY_ONLY_IDS.has(String(check?.id || '')));
  const ordered = [...blocking, ...recommendations, ...advisory];
  const primaryIssues = ordered.slice(0, PRIMARY_ISSUE_CAP);
  return {
    primaryIssues,
    overflowIssueCount: Math.max(0, ordered.length - primaryIssues.length),
  };
}

/**
 * @param {object|null} preflight
 * @returns {{
 *   blocked: boolean,
 *   errorCount: number,
 *   warningCount: number,
 *   totalChecks: number,
 *   issues: object[],
 *   primaryIssues: object[],
 *   overflowIssueCount: number,
 *   grouped: object
 * }}
 */
export function buildLaunchPreflightView(preflight) {
  const checks = Array.isArray(preflight?.checks) ? preflight.checks : [];
  const grouped = groupPreflightChecksBySeverity(checks);
  const issues = dedupePreflightChecks([...grouped.errors, ...grouped.warnings]);
  const { primaryIssues, overflowIssueCount } = pickPrimaryIssues(issues);
  const errorCount = grouped.errors.length;
  const warningCount = dedupePreflightChecks(grouped.warnings).length;

  return {
    blocked: errorCount > 0,
    errorCount,
    warningCount,
    totalChecks: checks.length,
    issues,
    primaryIssues,
    overflowIssueCount,
    grouped: {
      ...grouped,
      ok: grouped.ok.filter(check => !HIDDEN_OK_IDS.has(String(check?.id || ''))),
    },
  };
}

export function launchPreflightHeadline(view) {
  if (!view) {
    return 'Run preflight to see if this test is ready to launch.';
  }
  if (view.blocked) {
    return view.errorCount === 1
      ? 'Fix 1 blocking issue before launch.'
      : `Fix ${view.errorCount} blocking issues before launch.`;
  }
  if (view.warningCount > 0) {
    return view.warningCount === 1
      ? 'Ready to launch with 1 recommendation.'
      : `Ready to launch with ${view.warningCount} recommendations.`;
  }
  return 'Ready to launch.';
}
