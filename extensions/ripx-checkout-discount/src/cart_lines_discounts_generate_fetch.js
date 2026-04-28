import { HttpRequestMethod } from '../generated/api';
import { RIPX_CHECKOUT_PRICE_SECRET, RIPX_PRICE_RESOLVE_BATCH_URL } from './ripxConfig';

// Checkout discount path:
// storefront-script.js writes RipX attributes on cart lines, this fetch target sends them to the
// backend resolver, and cart_lines_discounts_generate_run.js converts the response into discounts.
// Price tests now use Cart Transform direct price only, so direct price lines are skipped here.
// This discount extension remains available for non-direct discount surfaces. See PRICE_TEST_FLOW.md.

function normalizePriceMethod(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'direct_override' || raw === 'directoverride' || raw === 'direct-override') {
    return 'direct_price_override';
  }
  if (raw === 'discounted' || raw === 'checkout_discount') {
    return 'discounted_checkout_price';
  }
  if (raw === 'native_variant' || raw === 'native-variant') {
    return 'native_variant_price';
  }
  return raw;
}

function resolveLinePriceMethod(line) {
  return normalizePriceMethod(
    line?.ripxPriceMethod?.value ||
      line?.ripxPriceApplicationMethod?.value ||
      line?.ripxPriceApplicationMethodLegacy?.value
  );
}

function hasOfferMarkers(line) {
  return Boolean(
    line?.ripxOfferDiscountType?.value ||
    line?.ripxOfferDiscountValue?.value ||
    line?.ripxOfferCodeName?.value
  );
}

function isPriceTestDirectLine(line, linePriceMethod) {
  if (hasOfferMarkers(line)) {
    return false;
  }
  if (linePriceMethod === 'direct_price_override' || linePriceMethod === 'native_variant_price') {
    return true;
  }
  return Boolean(line?.ripxTargetUnit?.value || line?.ripxDiscountUnit?.value);
}

/**
 * @param {import("../generated/api").RipxCartLinesFetch} input
 */
function resolveShopDomain(input) {
  const fromCart = input.cart?.shopAttr?.value?.trim();
  if (fromCart) {
    return fromCart;
  }
  for (const line of input.cart?.lines || []) {
    const s = line.ripxShop?.value?.trim();
    if (s) {
      return s;
    }
  }
  return '';
}

export function cartLinesDiscountsGenerateFetch(input) {
  const url = (RIPX_PRICE_RESOLVE_BATCH_URL || '').trim();
  if (!url) {
    return { request: null };
  }

  const shop = resolveShopDomain(input);
  if (!shop) {
    return { request: null };
  }

  const lines = [];
  for (const line of input.cart?.lines || []) {
    const testId = line.ripxTest?.value?.trim();
    const assignmentVariant = line.ripxVariant?.value?.trim();
    const linePriceMethod = resolveLinePriceMethod(line);
    if (!testId || !assignmentVariant) {
      continue;
    }
    if (isPriceTestDirectLine(line, linePriceMethod)) {
      // Price tests are Cart Transform direct-price cases. Sending stale direct-shaped lines to the
      // discount resolver can accidentally revive the old checkout-discount path.
      continue;
    }
    if (line.merchandise?.__typename !== 'ProductVariant') {
      continue;
    }
    const productId = line.merchandise.product?.id;
    const variantId = line.merchandise.id;
    if (!productId) {
      continue;
    }
    const amount = line.cost?.subtotalAmount?.amount;
    const currencyCode = line.cost?.subtotalAmount?.currencyCode;
    if (amount == null || String(amount).trim() === '') {
      continue;
    }

    const compareAtAmt = line.cost?.compareAtAmountPerQuantity?.amount;
    const compareAtCurrency = line.cost?.compareAtAmountPerQuantity?.currencyCode;
    const assignmentSig = line.ripxAssignmentSig?.value?.trim();
    const assignmentTs = line.ripxAssignmentTs?.value?.trim();
    const assignmentUser = line.ripxAssignmentUser?.value?.trim();

    // Keep this payload aligned with backend/src/services/priceTestCheckoutResolve.js
    // resolveCheckoutPriceBatchForDomain(). Missing proof fields usually means the resolver will
    // return applies=false with invalid_assignment_signature or a related reason.
    lines.push({
      line_id: line.id,
      test_id: testId,
      assignment_variant: assignmentVariant,
      assignment_sig: assignmentSig || null,
      assignment_ts: assignmentTs || null,
      assignment_user: assignmentUser || null,
      product_id: productId,
      variant_id: variantId || null,
      line_total: String(amount),
      qty: line.quantity,
      currency: currencyCode || null,
      ...(compareAtAmt != null && String(compareAtAmt).trim() !== ''
        ? {
            compare_at_unit: String(compareAtAmt),
            compare_at_currency: compareAtCurrency || null,
          }
        : {}),
    });
  }

  if (lines.length === 0) {
    return { request: null };
  }

  const jsonBody = { shop, lines };
  const body = JSON.stringify(jsonBody);

  /** @type {{ name: string; value: string }[]} */
  const headers = [
    { name: 'accept', value: 'application/json' },
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-RipX-Client', value: 'ripx-checkout-discount' },
  ];
  const secret = (RIPX_CHECKOUT_PRICE_SECRET || '').trim();
  if (secret) {
    headers.push({ name: 'X-RipX-Price-Secret', value: secret });
  }

  return {
    request: {
      headers,
      method: HttpRequestMethod.Post,
      // Shopify allows 100–2000ms only; values above 2000 are invalid (see shopify.dev network access performance).
      policy: {
        readTimeoutMs: 2000,
      },
      url,
      body,
      jsonBody,
    },
  };
}
