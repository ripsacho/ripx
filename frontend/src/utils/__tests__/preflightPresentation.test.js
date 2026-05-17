import {
  buildLaunchPreflightView,
  dedupePreflightChecks,
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
    expect(launchPreflightHeadline(view)).toMatch(/recommendation/);
  });

  it('caps primary issues and counts overflow', () => {
    const checks = [
      { id: 'shopify_oauth_health', severity: 'warning', message: 'scopes' },
      { id: 'storefront_runtime_ready', severity: 'warning', message: 'password' },
      { id: 'checkout_launch_readiness', severity: 'warning', message: 'checkout' },
      { id: 'pricing_storefront_surface_mapping', severity: 'warning', message: 'selectors' },
      { id: 'guardrail_enabled', severity: 'warning', message: 'guardrail off' },
    ];
    const view = buildLaunchPreflightView({ checks, errors: [], warnings: checks });
    expect(view.primaryIssues).toHaveLength(4);
    expect(view.overflowIssueCount).toBe(1);
    expect(view.primaryIssues[0].id).toBe('shopify_oauth_health');
  });
});
