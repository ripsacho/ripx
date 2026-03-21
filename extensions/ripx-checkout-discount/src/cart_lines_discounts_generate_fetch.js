import { HttpRequestMethod } from '../generated/api';
import { RIPX_CHECKOUT_PRICE_SECRET, RIPX_PRICE_RESOLVE_BATCH_URL } from './ripxConfig';

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
    if (!testId || !assignmentVariant) {
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

    lines.push({
      line_id: line.id,
      test_id: testId,
      assignment_variant: assignmentVariant,
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
