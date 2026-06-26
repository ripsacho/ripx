import {
  buildCommandCenterSetupSteps,
  getShopifyDomainStatusPresentation,
  summarizeCommandCenterSetupSteps,
} from '../commandCenterPresentation';

describe('commandCenterPresentation', () => {
  it('shows Ready for connected stores and scopes_stale without missing scopes', () => {
    expect(
      getShopifyDomainStatusPresentation({
        installState: 'connected',
        isShopify: true,
        canOpen: true,
      }).statusLabel
    ).toBe('Ready');

    expect(
      getShopifyDomainStatusPresentation({
        installState: 'scopes_stale',
        installDetail: { missingScopes: [] },
        isShopify: true,
        canOpen: true,
      }).statusLabel
    ).toBe('Ready');
  });

  it('builds install and storefront steps for openable stores', () => {
    const steps = buildCommandCenterSetupSteps({
      installState: 'connected',
      setupStatus: {
        available: true,
        proxyStatus: { ok: true, scriptDetected: true },
        embedStatus: { detected: false },
        storefrontRuntimeReady: false,
      },
      isShopify: true,
    });

    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'install', complete: true }),
        expect.objectContaining({ id: 'proxy', complete: true }),
        expect.objectContaining({ id: 'embed', complete: false }),
      ])
    );

    const summary = summarizeCommandCenterSetupSteps(steps);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.allComplete).toBe(false);
    expect(summary.nextStep?.id).toBe('embed');
  });

  it('skips storefront steps when install is still required', () => {
    const steps = buildCommandCenterSetupSteps({
      installState: 'needs_install',
      isShopify: true,
    });
    expect(steps.some(step => step.id === 'proxy')).toBe(false);
    expect(steps.find(step => step.id === 'install')?.complete).toBe(false);
  });
});
