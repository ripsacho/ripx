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

const PRIMARY_ISSUE_CAP = 3;
const SUMMARY_MAX_LEN = 140;

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
  const { title, summary } = formatPreflightIssueSummary(check);
  if (!summary) {
    return title;
  }
  return `${title}: ${summary}`;
}

/**
 * One-line merchant summary (full message stays in technical checks).
 */
export function formatPreflightIssueSummary(check) {
  const id = String(check?.id || '').trim();
  const title = preflightCheckTitle(check);
  const meta = check?.meta && typeof check.meta === 'object' ? check.meta : {};
  const raw = formatPreflightCheckMessage(check);

  if (id === 'shopify_oauth_health' || id === 'shopify_oauth_scopes') {
    const missing = Array.isArray(meta.missing_scopes) ? meta.missing_scopes : [];
    if (missing.length > 0) {
      return {
        title,
        summary: `Re-approve the app from My domains (install link, private browser). ${missing.length} permission${missing.length === 1 ? '' : 's'} still missing.`,
      };
    }
    return {
      title,
      summary: 'Reconnect or re-install the app from My domains.',
    };
  }

  if (id === 'storefront_runtime_ready') {
    if (meta.password_protected || meta.proxy_password_protected) {
      return {
        title,
        summary:
          'Store password blocks auto-check. Remove the password or open /apps/ripx/script.js while logged in.',
      };
    }
    return {
      title,
      summary:
        'Complete storefront setup in Store settings → Store setup (App Proxy and theme embed).',
    };
  }

  if (id === 'pricing_storefront_surface_mapping' || id === 'pricing_storefront_surface_coverage') {
    const mappingMatch = raw.match(/(\d+)\s+mappings?\s+still\s+needed/i);
    const gapMatch = raw.match(/missing for\s+([^.]+)/i);
    if (mappingMatch) {
      return {
        title,
        summary: `Map ${mappingMatch[1]} price selector${mappingMatch[1] === '1' ? '' : 's'} under Store settings → Store setup.`,
      };
    }
    if (gapMatch) {
      return {
        title,
        summary: `Map missing selectors in Store settings → Store setup (${gapMatch[1].trim()}).`,
      };
    }
    return {
      title,
      summary: 'Map theme price selectors in Store settings → Store setup.',
    };
  }

  if (id === 'checkout_launch_readiness') {
    return {
      title,
      summary: truncateSummary(
        raw.replace(/^checkout setup[:\s]*/i, '').trim() ||
          'Finish checkout extension setup in Settings.'
      ),
    };
  }

  if (id === 'guardrail_enabled') {
    return {
      title,
      summary: 'Optional: enable auto-stop guardrails in test settings.',
    };
  }

  let summary = raw;
  if (summary.toLowerCase().startsWith(title.toLowerCase())) {
    summary =
      summary
        .slice(title.length)
        .replace(/^[\s:–-]+/, '')
        .trim() || summary;
  }
  return { title, summary: truncateSummary(summary) };
}

function truncateSummary(text) {
  const value = String(text || '').trim();
  if (value.length <= SUMMARY_MAX_LEN) {
    return value;
  }
  return `${value.slice(0, SUMMARY_MAX_LEN - 1).trim()}…`;
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
  const core = [...blocking, ...recommendations];
  const ordered = core.length > 0 ? core : advisory.length > 0 ? [advisory[0]] : [];
  const primaryIssues = ordered.slice(0, PRIMARY_ISSUE_CAP);
  const overflowFromCore = Math.max(0, core.length - primaryIssues.length);
  const advisoryHidden =
    core.length > 0 ? advisory.length : Math.max(0, advisory.length - primaryIssues.length);
  return {
    primaryIssues,
    overflowIssueCount: overflowFromCore + advisoryHidden,
    hiddenAdvisoryCount: advisoryHidden,
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
  const { primaryIssues, overflowIssueCount, hiddenAdvisoryCount } = pickPrimaryIssues(issues);
  const errorCount = grouped.errors.length;
  const dedupedWarnings = dedupePreflightChecks(grouped.warnings);
  const warningCount = dedupedWarnings.length;
  const actionableWarningCount = dedupedWarnings.filter(
    check => !ADVISORY_ONLY_IDS.has(String(check?.id || ''))
  ).length;

  return {
    blocked: errorCount > 0,
    errorCount,
    warningCount,
    actionableWarningCount,
    totalChecks: checks.length,
    issues,
    primaryIssues,
    overflowIssueCount,
    hiddenAdvisoryCount,
    grouped: {
      ...grouped,
      ok: grouped.ok.filter(check => !HIDDEN_OK_IDS.has(String(check?.id || ''))),
    },
  };
}

export function launchPreflightBannerTitle(view) {
  if (!view) {
    return null;
  }
  if (view.blocked) {
    return view.errorCount === 1
      ? 'Fix before launch'
      : `Fix ${view.errorCount} issues before launch`;
  }
  if (view.primaryIssues.length > 0) {
    const n = view.primaryIssues.length + (view.overflowIssueCount > 0 ? 1 : 0);
    return view.actionableWarningCount > 0 || view.blocked
      ? `Review ${n} item${n === 1 ? '' : 's'} — you can still launch`
      : 'Ready to launch';
  }
  return 'Ready to launch';
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
  if (view.primaryIssues.length > 0) {
    return 'Review the items below, then start the test when you are ready.';
  }
  return 'Ready to launch.';
}
