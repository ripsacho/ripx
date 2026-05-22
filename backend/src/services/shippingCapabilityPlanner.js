const shopifyService = require('./shopifyService');
const fs = require('fs');
const path = require('path');

const CHECKOUT_DISCOUNT_EXTENSION_TOML = path.resolve(
  __dirname,
  '../../../extensions/ripx-checkout-discount/shopify.extension.toml'
);

function toLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function parseScopes() {
  return String(process.env.SHOPIFY_SCOPES || '')
    .split(',')
    .map(scope => scope.trim())
    .filter(Boolean);
}

function hasAnyScope(scopes = [], allowed = []) {
  const set = new Set((Array.isArray(scopes) ? scopes : []).map(scope => String(scope).trim()));
  return allowed.some(scope => set.has(scope));
}

function isCheckoutDiscountNetworkAccessEnabled() {
  try {
    const toml = fs.readFileSync(CHECKOUT_DISCOUNT_EXTENSION_TOML, 'utf8');
    return /\[extensions\.capabilities\][\s\S]*?\bnetwork_access\s*=\s*true\b/i.test(toml);
  } catch (_error) {
    return false;
  }
}

function derivePlanTier(plan = {}) {
  const displayName = toLower(plan.displayName || plan.name);
  const plusFlag = Boolean(plan.shopifyPlus);
  const devFlag = Boolean(plan.partnerDevelopment);

  if (plusFlag || displayName.includes('plus') || displayName.includes('enterprise')) {
    return 'plus';
  }
  if (devFlag || displayName.includes('development') || displayName.includes('partner test')) {
    return 'development';
  }
  if (displayName.includes('advanced')) {
    return 'advanced';
  }
  if (displayName.includes('grow')) {
    return 'grow';
  }
  return 'basic';
}

async function fetchShopPlan(shopDomain, accessToken) {
  const primaryQuery = `
    query RipxShippingPlanPrimary {
      shop {
        id
        myshopifyDomain
        plan {
          displayName
          partnerDevelopment
          shopifyPlus
        }
      }
    }
  `;
  const fallbackQuery = `
    query RipxShippingPlanFallback {
      shop {
        id
        myshopifyDomain
        plan {
          displayName
        }
      }
    }
  `;

  try {
    const response = await shopifyService.requestAdminGraphql(
      shopDomain,
      accessToken,
      primaryQuery,
      {},
      { apiVersion: '2025-04' }
    );
    return response?.data?.shop || null;
  } catch (_error) {
    const fallback = await shopifyService.requestAdminGraphql(
      shopDomain,
      accessToken,
      fallbackQuery,
      {},
      { apiVersion: '2025-04' }
    );
    return fallback?.data?.shop || null;
  }
}

function buildPlanCapabilities(planTier, scopes = []) {
  const hasReadShipping = hasAnyScope(scopes, ['read_shipping']);
  const hasWriteShipping = hasAnyScope(scopes, ['write_shipping']);
  const hasReadDiscounts = hasAnyScope(scopes, ['read_discounts']);
  const hasWriteDiscounts = hasAnyScope(scopes, ['write_discounts']);

  const carrierServiceAvailable =
    planTier === 'plus' || planTier === 'advanced' || planTier === 'development';
  const deliveryCustomizationAvailable = planTier === 'plus' || planTier === 'development';
  const discountFunctionAvailable = hasReadDiscounts || hasWriteDiscounts;
  const networkAccessEnabled = isCheckoutDiscountNetworkAccessEnabled();
  const networkAccessLikely =
    networkAccessEnabled && (planTier === 'plus' || planTier === 'development');

  const warnings = [];
  if (!hasReadShipping && !hasWriteShipping) {
    warnings.push('SHOPIFY_SCOPES is missing read_shipping/write_shipping.');
  }
  if (!hasReadDiscounts && !hasWriteDiscounts) {
    warnings.push('SHOPIFY_SCOPES is missing read_discounts/write_discounts.');
  }
  if (discountFunctionAvailable && !networkAccessEnabled) {
    warnings.push(
      'Checkout discount extension network_access is disabled; shipping resolver fetch will not run.'
    );
  }
  if (discountFunctionAvailable && networkAccessEnabled && !networkAccessLikely) {
    warnings.push(
      'Checkout discount network_access is enabled, but Shopify may restrict network fetch on this plan.'
    );
  }

  return {
    plan_tier: planTier,
    adapter_support: {
      carrier_service: {
        available: carrierServiceAvailable,
        reason: carrierServiceAvailable
          ? 'Plan tier supports carrier-calculated shipping.'
          : 'CarrierService usually requires Advanced/Plus (or dev store equivalents).',
      },
      delivery_customization: {
        available: deliveryCustomizationAvailable,
        reason: deliveryCustomizationAvailable
          ? 'Delivery customization functions are typically available on Plus/dev stores.'
          : 'Delivery customizations are typically limited to Plus/dev stores.',
      },
      discount_function: {
        available: discountFunctionAvailable && networkAccessLikely,
        scopes_available: discountFunctionAvailable,
        network_access_enabled: networkAccessEnabled,
        network_fetch_supported: networkAccessLikely,
        reason:
          discountFunctionAvailable && networkAccessLikely
            ? networkAccessLikely
              ? 'Discount function path with fetch should be available.'
              : 'Discount function path is available, but network fetch may be restricted.'
            : !discountFunctionAvailable
              ? 'Discount scopes are not configured.'
              : !networkAccessEnabled
                ? 'Checkout discount extension network_access is disabled.'
                : 'Discount function network fetch may be restricted on this plan.',
      },
      manual: {
        available: true,
        reason: 'Manual execution can always be used as fallback.',
      },
    },
    warnings,
  };
}

function recommendExecutionPath(capabilities) {
  if (capabilities?.adapter_support?.carrier_service?.available) {
    return 'carrier_service';
  }
  if (capabilities?.adapter_support?.discount_function?.available) {
    return 'discount_function';
  }
  if (capabilities?.adapter_support?.delivery_customization?.available) {
    return 'delivery_customization';
  }
  return 'manual';
}

async function buildShippingCapabilityReport(shopDomain, accessToken) {
  const shop = await fetchShopPlan(shopDomain, accessToken);
  const plan = shop?.plan || {};
  const planTier = derivePlanTier(plan);
  const scopes = parseScopes();
  const capabilities = buildPlanCapabilities(planTier, scopes);
  return {
    shop: {
      id: shop?.id || null,
      myshopify_domain: shop?.myshopifyDomain || shopDomain,
      plan_display_name: plan?.displayName || null,
      plan_tier: planTier,
    },
    scopes,
    capabilities,
    recommended_execution_path: recommendExecutionPath(capabilities),
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildShippingCapabilityReport,
  derivePlanTier,
  buildPlanCapabilities,
  recommendExecutionPath,
};
