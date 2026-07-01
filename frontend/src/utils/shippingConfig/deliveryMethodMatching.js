import { buildNativeDeliveryMethodCodes } from './offerWizard';

export function normalizeComparableDeliveryTitle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[·•|–—-].*$/, '')
    .replace(/\best\.?\b/g, '')
    .replace(/\bshipping\b/g, '')
    .replace(/\bdelivery\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesDeliveryMethodTitle(title, hideNames = []) {
  const normalizedTitle = normalizeComparableDeliveryTitle(title);
  if (!normalizedTitle) {
    return false;
  }
  return hideNames.some(item => {
    const wanted = normalizeComparableDeliveryTitle(item);
    if (!wanted) {
      return false;
    }
    if (normalizedTitle === wanted) {
      return true;
    }
    if (normalizedTitle.includes(wanted) || wanted.includes(normalizedTitle)) {
      return true;
    }
    const titleTokens = normalizedTitle.split(' ').filter(Boolean);
    const wantedTokens = wanted.split(' ').filter(Boolean);
    return wantedTokens.length > 0 && wantedTokens.every(token => titleTokens.includes(token));
  });
}

function pushIdentityToken(tokens, value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return;
  }
  tokens.add(raw);
  tokens.add(raw.toLowerCase());
  const tail = raw.split('/').pop();
  if (tail) {
    tokens.add(tail);
    tokens.add(tail.toLowerCase());
  }
  const numeric = raw.match(/(\d{4,})\s*$/);
  if (numeric) {
    tokens.add(numeric[1]);
  }
}

export function getShippingRateIdentityTokens(rate = {}) {
  const tokens = new Set();
  pushIdentityToken(tokens, rate?.id);
  pushIdentityToken(tokens, rate?.method_definition_id);
  pushIdentityToken(tokens, rate?.rate_provider_id);
  if (Array.isArray(rate?.source_ids)) {
    rate.source_ids.forEach(id => pushIdentityToken(tokens, id));
  }
  return tokens;
}

export function extractScopedDeliveryMethodCodes(scope = {}) {
  const ids = [
    ...(Array.isArray(scope.selected_method_definition_ids)
      ? scope.selected_method_definition_ids
      : []),
    ...(Array.isArray(scope.selectedMethodDefinitionIds) ? scope.selectedMethodDefinitionIds : []),
    ...(Array.isArray(scope.selected_rate_ids) ? scope.selected_rate_ids : []),
    ...(Array.isArray(scope.selectedRateIds) ? scope.selectedRateIds : []),
  ];
  const codes = new Set();
  ids.forEach(id => {
    getShippingRateIdentityTokens({ id }).forEach(token => codes.add(token));
  });
  return Array.from(codes).filter(Boolean).slice(0, 50);
}

export function buildDeliveryHideTargetingCodes(methodNames = [], scope = {}) {
  return Array.from(
    new Set([
      ...buildNativeDeliveryMethodCodes(methodNames),
      ...extractScopedDeliveryMethodCodes(scope),
    ])
  ).slice(0, 50);
}

export function shouldHideNativeShippingRate(
  rate = {},
  { hideNames = [], hideIds = [], hideCodes = [] } = {}
) {
  const name = String(rate?.name || '').trim();
  if (name && matchesDeliveryMethodTitle(name, hideNames)) {
    return true;
  }

  const hideIdSet = new Set(hideIds.map(id => String(id || '').trim()).filter(Boolean));
  if (hideIdSet.size > 0) {
    for (const token of getShippingRateIdentityTokens(rate)) {
      if (hideIdSet.has(token)) {
        return true;
      }
    }
  }

  if (Array.isArray(rate?.source_ids) && hideIdSet.size > 0) {
    if (rate.source_ids.some(id => hideIdSet.has(String(id || '').trim()))) {
      return true;
    }
  }

  const normalizedCodes = hideCodes
    .map(code =>
      String(code || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
  if (normalizedCodes.length > 0) {
    const rateCode = String(rate?.code || rate?.service_code || '')
      .trim()
      .toLowerCase();
    if (
      rateCode &&
      normalizedCodes.some(
        code => rateCode === code || rateCode.includes(code) || code.includes(rateCode)
      )
    ) {
      return true;
    }
  }

  return false;
}

export function partitionNativeShippingRates(
  rates = [],
  { hideNames = [], hideIds = [], hideCodes = [] } = {}
) {
  const visible = [];
  const hidden = [];
  rates.forEach(rate => {
    if (shouldHideNativeShippingRate(rate, { hideNames, hideIds, hideCodes })) {
      hidden.push(rate);
    } else {
      visible.push(rate);
    }
  });
  return { visible, hidden };
}
