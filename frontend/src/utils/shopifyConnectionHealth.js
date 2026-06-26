/**
 * Interpret GET /api/shopify/connection-status for UI gating.
 */

export function isShopifyConnectionHealthy(status) {
  if (!status || typeof status !== 'object') {
    return false;
  }
  const code = String(status.connection?.code || status.raw?.connection?.code || '')
    .trim()
    .toUpperCase();
  if (code === 'VERIFY_UNAVAILABLE') {
    return false;
  }
  if (status.tokenHealth?.checkFailed === true) {
    return false;
  }
  return Boolean(status.connected);
}

/**
 * Whether the user can open the RipX app for this store after OAuth or from home.
 * Allows a live token with stale scopes so the in-app banner can prompt reconnect.
 */
export function shouldOpenShopifyApp(status) {
  if (!status || typeof status !== 'object') {
    return false;
  }
  if (isShopifyConnectionHealthy(status)) {
    return true;
  }
  const code = String(status.connection?.code || status.raw?.connection?.code || '')
    .trim()
    .toUpperCase();
  if (status.tokenHealth?.valid === true && code === 'SCOPES_STALE') {
    return true;
  }
  if (code === 'SESSION_OK' && status.connected) {
    return true;
  }
  if (code === 'SESSION_OK_UNVERIFIED_SCOPES' && status.connected) {
    return true;
  }
  return false;
}

export function isShopifyStoreOpenableState(state) {
  return ['connected', 'scopes_stale'].includes(String(state || '').toLowerCase());
}

export function needsScopeReauthorization(status) {
  if (!status || typeof status !== 'object') {
    return false;
  }
  const code = String(status.connection?.code || status.raw?.connection?.code || '')
    .trim()
    .toUpperCase();
  const missingScopes = status.tokenHealth?.missingScopes || status.missingScopes || [];
  return code === 'SCOPES_STALE' && Array.isArray(missingScopes) && missingScopes.length > 0;
}

export function getShopifyConnectionUiState(status, errorMeta = null) {
  if (errorMeta?.state && errorMeta.state !== 'unknown') {
    return errorMeta.state;
  }
  if (!status) {
    return 'unknown';
  }
  const code = String(status.connection?.code || '')
    .trim()
    .toUpperCase();
  if (code === 'VERIFY_UNAVAILABLE' || status.tokenHealth?.checkFailed) {
    return 'verify_unavailable';
  }
  if (status.connected) {
    return 'connected';
  }
  return String(status.connection?.state || 'needs_install').toLowerCase();
}
