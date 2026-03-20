/**
 * Shopify Discount Function network fetch: response headers + body must stay under ~100KB
 * or Shopify returns 502 to the function. We reject early with 413 so operators see a clear error.
 * @see https://shopify.dev/docs/apps/build/functions/network-access/performance-and-resilience
 */

const { PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES } = require('../constants');

/**
 * UTF-8 byte length of JSON.stringify(payload) — matches what Shopify measures on the wire.
 * @param {object} payload
 * @returns {number}
 */
function batchResolveJsonUtf8Bytes(payload) {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

/**
 * @param {object} payload - typically { success: true, lines: [...] }
 * @param {number} [maxBytes]
 * @returns {boolean}
 */
function batchResolveResponseTooLarge(payload, maxBytes = PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES) {
  return batchResolveJsonUtf8Bytes(payload) > maxBytes;
}

/**
 * Shopify discount `run` target only reads line_id, applies, discountDecimal.
 * Default: omit targetLineDecimal/reason to shrink JSON (Shopify ~100KB cap).
 * Set RIPX_PRICE_BATCH_FULL_RESPONSE=true for debugging or external integrators.
 * @param {Array<{ line_id: string, applies: boolean, discountDecimal: string|null, targetLineDecimal?: string|null, reason?: string|null }>} resolved
 * @returns {object[]}
 */
function shapePriceResolveBatchLinesForCheckout(resolved) {
  const full = process.env.RIPX_PRICE_BATCH_FULL_RESPONSE === 'true';
  if (full) {
    return resolved;
  }
  return resolved.map(r => ({
    line_id: r.line_id,
    applies: !!r.applies,
    discountDecimal: r.applies ? r.discountDecimal || null : null,
  }));
}

module.exports = {
  batchResolveJsonUtf8Bytes,
  batchResolveResponseTooLarge,
  shapePriceResolveBatchLinesForCheckout,
};
