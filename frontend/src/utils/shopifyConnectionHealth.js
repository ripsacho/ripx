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
