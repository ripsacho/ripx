import { HttpRequestMethod } from '../generated/api';
import { RIPX_CHECKOUT_PRICE_SECRET, RIPX_SHIPPING_RESOLVE_BATCH_URL } from './ripxConfig';

function resolveShopDomain(input) {
  const fromCart = input?.cart?.shopAttr?.value?.trim();
  if (fromCart) {
    return fromCart;
  }
  for (const group of input?.cart?.deliveryGroups || []) {
    for (const line of group?.cartLines || []) {
      const shop = line?.ripxShop?.value?.trim();
      if (shop) {
        return shop;
      }
    }
  }
  return '';
}

function extractLineAssignment(line) {
  const testId = String(line?.ripxTest?.value || '').trim();
  const variantId = String(line?.ripxVariant?.value || '').trim();
  if (!testId || !variantId) {
    return null;
  }
  return {
    test_id: testId,
    assignment_variant: variantId,
    assignment_sig: line?.ripxAssignmentSig?.value?.trim() || null,
    assignment_ts: line?.ripxAssignmentTs?.value?.trim() || null,
    assignment_user: line?.ripxAssignmentUser?.value?.trim() || null,
  };
}

function extractProductId(line) {
  if (line?.merchandise?.__typename !== 'ProductVariant') {
    return '';
  }
  return String(line?.merchandise?.product?.id || '').trim();
}

function resolveGroupAssignment(group) {
  const lines = Array.isArray(group?.cartLines) ? group.cartLines : [];
  const assignments = lines.map(extractLineAssignment).filter(Boolean);
  if (assignments.length === 0) {
    return null;
  }

  const uniqueAssignmentKeys = new Set(
    assignments.map(assignment => `${assignment.test_id}::${assignment.assignment_variant}`)
  );
  if (uniqueAssignmentKeys.size > 1) {
    return { ambiguous: true };
  }

  const assignmentWithProof = assignments.find(
    assignment =>
      assignment.assignment_sig && assignment.assignment_ts && assignment.assignment_user
  );
  return assignmentWithProof || assignments[0];
}

/**
 * @param {import("../generated/api").RipxDeliveryFetch} input
 */
export function cartDeliveryOptionsDiscountsGenerateFetch(input) {
  const url = (RIPX_SHIPPING_RESOLVE_BATCH_URL || '').trim();
  if (!url) {
    return { request: null };
  }

  const shop = resolveShopDomain(input);
  if (!shop) {
    return { request: null };
  }

  const cartTotal = input?.cart?.cost?.totalAmount?.amount;
  if (cartTotal === null || cartTotal === undefined || String(cartTotal).trim() === '') {
    return { request: null };
  }

  const groups = [];
  for (const group of input?.cart?.deliveryGroups || []) {
    const groupId = String(group?.id || '').trim();
    const lines = Array.isArray(group?.cartLines) ? group.cartLines : [];
    const handles = Array.isArray(group?.deliveryOptions)
      ? group.deliveryOptions.map(option => String(option?.handle || '').trim()).filter(Boolean)
      : [];
    if (!groupId || handles.length === 0) {
      continue;
    }

    const assignment = resolveGroupAssignment(group);
    if (!assignment || assignment.ambiguous) {
      continue;
    }
    const productIds = Array.from(new Set(lines.map(extractProductId).filter(Boolean)));

    groups.push({
      delivery_group_id: groupId,
      handles,
      product_ids: productIds,
      test_id: assignment.test_id,
      assignment_variant: assignment.assignment_variant,
      assignment_sig: assignment.assignment_sig,
      assignment_ts: assignment.assignment_ts,
      assignment_user: assignment.assignment_user,
      cart_total: String(cartTotal),
    });
  }

  if (groups.length === 0) {
    return { request: null };
  }

  const jsonBody = { shop, groups };
  const body = JSON.stringify(jsonBody);
  const headers = [
    { name: 'accept', value: 'application/json' },
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-RipX-Client', value: 'ripx-checkout-delivery-discount' },
  ];
  const secret = (RIPX_CHECKOUT_PRICE_SECRET || '').trim();
  if (secret) {
    headers.push({ name: 'X-RipX-Price-Secret', value: secret });
  }

  return {
    request: {
      headers,
      method: HttpRequestMethod.Post,
      policy: {
        readTimeoutMs: 2000,
      },
      url,
      body,
      jsonBody,
    },
  };
}
