import { isShopifyStoreOpenableState } from './shopifyConnectionHealth';
import { isStorefrontRuntimeReady } from './storefrontSetupStatus';

export function needsScopeUpdateFromInstallDetail(installDetail) {
  const missingScopes = installDetail?.missingScopes || [];
  return (
    installDetail?.state === 'scopes_stale' &&
    Array.isArray(missingScopes) &&
    missingScopes.length > 0
  );
}

export function getShopifyDomainStatusPresentation({
  installState,
  installDetail = null,
  canOpen = false,
  isShopify = true,
}) {
  if (!isShopify) {
    return {
      statusLabel: canOpen ? 'Connected' : 'Connect with API key',
      statusTone: canOpen ? 'connected' : 'disconnected',
      needsScopeUpdate: false,
      isShopifyReady: canOpen,
    };
  }

  const needsScopeUpdate = needsScopeUpdateFromInstallDetail({
    state: installState,
    missingScopes: installDetail?.missingScopes || [],
  });
  const isShopifyReady =
    isShopifyStoreOpenableState(installState) &&
    !['needs_install', 'needs_link', 'restricted'].includes(installState);

  let statusLabel = 'Status unknown';
  if (installState === 'connected' || (installState === 'scopes_stale' && !needsScopeUpdate)) {
    statusLabel = 'Ready';
  } else if (needsScopeUpdate) {
    statusLabel = 'Permissions needed';
  } else if (installState === 'needs_install') {
    statusLabel = 'Needs install';
  } else if (installState === 'needs_link') {
    statusLabel = 'Needs link';
  } else if (installState === 'restricted') {
    statusLabel = 'Restricted';
  } else if (installState === 'checking') {
    statusLabel = 'Checking…';
  }

  const statusTone =
    isShopifyReady || installState === 'connected'
      ? 'connected'
      : installState === 'checking'
        ? 'checking'
        : 'disconnected';

  return {
    statusLabel,
    statusTone,
    needsScopeUpdate,
    isShopifyReady,
  };
}

export function getShopifyDomainPrimaryCtaLabel({
  installState,
  isShopifyReady,
  canOpen,
  isConnecting = false,
}) {
  if (isConnecting) {
    return 'Connecting…';
  }
  if (installState === 'needs_install') {
    return 'Install app';
  }
  if (installState === 'needs_link') {
    return 'Link app';
  }
  if (installState === 'restricted') {
    return 'Review access';
  }
  if (isShopifyReady || canOpen) {
    return 'Open A/B tests';
  }
  return 'Connect';
}

export function buildCommandCenterSetupSteps({
  installState,
  installDetail = null,
  setupStatus = null,
  isShopify = true,
}) {
  if (!isShopify) {
    return [];
  }

  const steps = [];
  const needsScopeUpdate = needsScopeUpdateFromInstallDetail({
    state: installState,
    missingScopes: installDetail?.missingScopes || [],
  });

  if (installState === 'needs_install') {
    steps.push({
      id: 'install',
      label: 'Install RipX in Shopify',
      complete: false,
      required: true,
    });
  } else {
    steps.push({
      id: 'install',
      label: 'RipX app installed',
      complete: true,
      required: true,
    });
  }

  if (installState === 'needs_link') {
    steps.push({
      id: 'link',
      label: 'Link store to your account',
      complete: false,
      required: true,
    });
  } else if (installState !== 'needs_install') {
    steps.push({
      id: 'link',
      label: 'Store linked to your account',
      complete: true,
      required: true,
    });
  }

  if (needsScopeUpdate) {
    steps.push({
      id: 'permissions',
      label: 'Update optional permissions',
      complete: false,
      required: false,
    });
  }

  if (isShopifyStoreOpenableState(installState) && setupStatus?.available !== false) {
    const proxyReady = Boolean(
      setupStatus?.proxyStatus?.scriptDetected || setupStatus?.proxyStatus?.ok
    );
    const embedReady = Boolean(setupStatus?.embedStatus?.detected);
    const runtimeReady = isStorefrontRuntimeReady(setupStatus);

    if (setupStatus) {
      steps.push({
        id: 'proxy',
        label: 'App Proxy script live',
        complete: proxyReady,
        required: true,
      });
      steps.push({
        id: 'embed',
        label: 'Theme app embed enabled',
        complete: embedReady,
        required: true,
      });
      steps.push({
        id: 'runtime',
        label: 'Storefront tracking ready',
        complete: runtimeReady,
        required: true,
      });
    }
  }

  return steps;
}

export function summarizeCommandCenterSetupSteps(steps = []) {
  const required = steps.filter(step => step.required);
  const complete = required.filter(step => step.complete).length;
  const pending = required.filter(step => !step.complete);
  return {
    complete,
    total: required.length,
    allComplete: required.length > 0 && complete === required.length,
    nextStep: pending[0] || null,
    pendingCount: pending.length,
  };
}
