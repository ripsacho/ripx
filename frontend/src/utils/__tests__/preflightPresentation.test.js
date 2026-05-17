import {
  buildLaunchPreflightView,
  dedupePreflightChecks,
  formatPreflightIssueSummary,
  launchPreflightHeadline,
} from '../preflightPresentation';

describe('preflightPresentation', () => {
  it('dedupes oauth and selector checks', () => {
    const deduped = dedupePreflightChecks([
      { id: 'shopify_oauth_health', severity: 'warning', message: 'a' },
      { id: 'shopify_oauth_scopes', severity: 'warning', message: 'b' },
      { id: 'pricing_storefront_surface_mapping', severity: 'warning', message: 'c' },
      { id: 'pricing_storefront_surface_coverage', severity: 'warning', message: 'd' },
    ]);
    expect(deduped).toHaveLength(2);
  });

  it('builds blocked headline for errors', () => {
    const view = buildLaunchPreflightView({
      checks: [{ id: 'x', ok: false, severity: 'error', message: 'blocked' }],
      errors: [{ id: 'x' }],
      warnings: [],
    });
    expect(view.blocked).toBe(true);
    expect(launchPreflightHeadline(view)).toMatch(/blocking issue/);
  });

  it('builds recommendation headline for warnings only', () => {
    const view = buildLaunchPreflightView({
      checks: [{ id: 'guardrail_enabled', ok: false, severity: 'warning', message: 'off' }],
      errors: [],
      warnings: [{ id: 'guardrail_enabled' }],
    });
    expect(view.blocked).toBe(false);
    expect(launchPreflightHeadline(view)).toMatch(/Review the items below/);
  });

  it('caps primary issues, hides advisory when other warnings exist', () => {
    const checks = [
      { id: 'shopify_oauth_health', severity: 'warning', message: 'scopes' },
      { id: 'storefront_runtime_ready', severity: 'warning', message: 'password' },
      { id: 'checkout_launch_readiness', severity: 'warning', message: 'checkout' },
      { id: 'pricing_storefront_surface_mapping', severity: 'warning', message: 'selectors' },
      { id: 'guardrail_enabled', severity: 'warning', message: 'guardrail off' },
    ];
    const view = buildLaunchPreflightView({ checks, errors: [], warnings: checks });
    expect(view.primaryIssues).toHaveLength(3);
    expect(view.overflowIssueCount).toBe(2);
    expect(view.primaryIssues[0].id).toBe('shopify_oauth_health');
    expect(view.primaryIssues.some(c => c.id === 'guardrail_enabled')).toBe(false);
  });

  it('shortens oauth issue summary', () => {
    const { summary } = formatPreflightIssueSummary({
      id: 'shopify_oauth_health',
      message: 'RipX needs updated Shopify permissions (read_discounts). Open My domains...',
      meta: { missing_scopes: ['read_discounts', 'write_discounts'] },
    });
    expect(summary).toMatch(/My domains/);
    expect(summary.length).toBeLessThan(160);
  });
});
