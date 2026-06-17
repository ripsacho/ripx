const shopifyService = require('./shopifyService');

function toFiniteNumber(value) {
  const number = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(number) ? number : null;
}

function normalizeCurrency(value, fallback = 'USD') {
  const raw = String(value || fallback || 'USD')
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : 'USD';
}

function moneyText(amount, currency = 'USD') {
  const number = toFiniteNumber(amount);
  if (number === null) {
    return null;
  }
  return `${normalizeCurrency(currency)} ${number.toFixed(2)}`;
}

function normalizeCountryCode(country = {}) {
  const raw = country?.code?.countryCode || country?.code || country?.countryCode || '';
  const code = String(raw || '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function normalizeRate({
  id = null,
  name,
  amount = null,
  currency = 'USD',
  source = 'manual',
  profileId = null,
  profileName = null,
  profileLocationGroupId = null,
  zoneId = null,
  zoneName = null,
  countries = [],
  condition = null,
  active = true,
  rateProviderType = null,
  rateProviderId = null,
  deliveryParticipantId = null,
  carrierService = null,
  participantServices = [],
  adaptToNewServices = null,
}) {
  const normalizedAmount = toFiniteNumber(amount);
  const normalizedCurrency = normalizeCurrency(currency);
  return {
    id,
    name: String(name || 'Shipping rate').trim(),
    amount: normalizedAmount,
    currency: normalizedCurrency,
    formatted_amount:
      normalizedAmount === null ? null : moneyText(normalizedAmount, normalizedCurrency),
    source,
    profile_id: profileId,
    profile_name: profileName,
    profile_location_group_id: profileLocationGroupId,
    zone_id: zoneId,
    zone_name: zoneName,
    countries: Array.isArray(countries) ? countries.filter(Boolean) : [],
    condition,
    active: active !== false,
    method_definition_id: id,
    rate_provider_type: rateProviderType,
    rate_provider_id: rateProviderId,
    delivery_participant_id: deliveryParticipantId,
    carrier_service: carrierService,
    carrier_service_id: carrierService?.id || null,
    carrier_service_name: carrierService?.name || null,
    carrier_service_callback_url: carrierService?.callback_url || null,
    carrier_service_active:
      carrierService && carrierService.active !== undefined
        ? carrierService.active !== false
        : null,
    participant_services: Array.isArray(participantServices) ? participantServices : [],
    adapt_to_new_services: adaptToNewServices,
  };
}

function extractRateProviderAmount(rateProvider = {}) {
  const price = rateProvider?.price || rateProvider?.fixedFee || null;
  return {
    amount: price?.amount ?? null,
    currency: price?.currencyCode || 'USD',
  };
}

function parseGraphqlDeliveryProfiles(payload = {}) {
  const profileEdges = payload?.data?.deliveryProfiles?.edges || [];
  const profiles = [];
  const rates = [];

  profileEdges.forEach(profileEdge => {
    const profile = profileEdge?.node || {};
    const profileId = profile.id || null;
    const profileName = profile.name || (profile.default ? 'General profile' : 'Delivery profile');
    const profileSummary = {
      id: profileId,
      name: profileName,
      default: Boolean(profile.default),
      zones: [],
    };

    const locationGroups = profile.profileLocationGroups || [];
    locationGroups.forEach(locationGroup => {
      const profileLocationGroupId = locationGroup?.locationGroup?.id || null;
      const zoneEdges = locationGroup?.locationGroupZones?.edges || [];
      zoneEdges.forEach(zoneEdge => {
        const zoneNode = zoneEdge?.node || {};
        const zone = zoneNode.zone || {};
        const countries = Array.isArray(zone.countries)
          ? zone.countries.map(normalizeCountryCode).filter(Boolean)
          : [];
        const zoneSummary = {
          id: zone.id || null,
          name: zone.name || 'Shipping zone',
          countries,
          rates: [],
        };

        const methodEdges = zoneNode.methodDefinitions?.edges || [];
        methodEdges.forEach(methodEdge => {
          const method = methodEdge?.node || {};
          const rateProvider = method.rateProvider || {};
          const providerType = rateProvider.__typename || null;
          const providerAmount = extractRateProviderAmount(rateProvider);
          const carrierService = rateProvider?.carrierService
            ? {
                id: rateProvider.carrierService.id || null,
                name: rateProvider.carrierService.name || null,
                callback_url: rateProvider.carrierService.callbackUrl || null,
                active: rateProvider.carrierService.active !== false,
                supports_service_discovery:
                  rateProvider.carrierService.supportsServiceDiscovery !== false,
              }
            : null;
          const participantServices = Array.isArray(rateProvider?.participantServices)
            ? rateProvider.participantServices
                .map(service => ({
                  name: service?.name || null,
                  active: service?.active !== false,
                }))
                .filter(service => service.name)
            : [];
          const rate = normalizeRate({
            id: method.id || null,
            name: method.name || rateProvider.name || 'Shipping rate',
            amount: providerAmount.amount,
            currency: providerAmount.currency,
            source: providerAmount.amount === null ? 'carrier_or_calculated' : 'manual',
            profileId,
            profileName,
            profileLocationGroupId,
            zoneId: zone.id || null,
            zoneName: zone.name || 'Shipping zone',
            countries,
            active: method.active !== false,
            rateProviderType: providerType,
            rateProviderId: rateProvider.id || null,
            deliveryParticipantId:
              providerType === 'DeliveryParticipant' ? rateProvider.id || null : null,
            carrierService,
            participantServices,
            adaptToNewServices:
              typeof rateProvider?.adaptToNewServicesFlag === 'boolean'
                ? rateProvider.adaptToNewServicesFlag
                : null,
          });
          rates.push(rate);
          zoneSummary.rates.push(rate);
        });

        profileSummary.zones.push(zoneSummary);
      });
    });

    profiles.push(profileSummary);
  });

  return { profiles, rates };
}

function buildConditionFromRestRate(rate = {}) {
  const parts = [];
  const minSubtotal = toFiniteNumber(rate.min_order_subtotal);
  const maxSubtotal = toFiniteNumber(rate.max_order_subtotal);
  const minWeight = toFiniteNumber(rate.weight_low);
  const maxWeight = toFiniteNumber(rate.weight_high);

  if (minSubtotal !== null) {
    parts.push(`min subtotal ${moneyText(minSubtotal, rate.currency)}`);
  }
  if (maxSubtotal !== null) {
    parts.push(`max subtotal ${moneyText(maxSubtotal, rate.currency)}`);
  }
  if (minWeight !== null) {
    parts.push(`min weight ${minWeight}`);
  }
  if (maxWeight !== null) {
    parts.push(`max weight ${maxWeight}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function parseRestShippingZones(payload = {}) {
  const zones = Array.isArray(payload.shipping_zones) ? payload.shipping_zones : [];
  const profiles = [
    {
      id: null,
      name: 'Shopify shipping zones',
      default: true,
      zones: [],
    },
  ];
  const rates = [];

  zones.forEach(zone => {
    const countries = Array.isArray(zone.countries)
      ? zone.countries.map(country => country?.code).filter(Boolean)
      : [];
    const zoneSummary = {
      id: zone.id ? String(zone.id) : null,
      name: zone.name || 'Shipping zone',
      countries,
      rates: [],
    };
    const manualRates = [
      ...(Array.isArray(zone.price_based_shipping_rates) ? zone.price_based_shipping_rates : []),
      ...(Array.isArray(zone.weight_based_shipping_rates) ? zone.weight_based_shipping_rates : []),
    ];

    manualRates.forEach(restRate => {
      const rate = normalizeRate({
        id: restRate.id ? String(restRate.id) : null,
        name: restRate.name || 'Shipping rate',
        amount: restRate.price,
        currency: restRate.currency || 'USD',
        source: 'manual',
        profileName: 'Shopify shipping zones',
        zoneId: zoneSummary.id,
        zoneName: zoneSummary.name,
        countries,
        condition: buildConditionFromRestRate(restRate),
      });
      rates.push(rate);
      zoneSummary.rates.push(rate);
    });

    const carrierRates = Array.isArray(zone.carrier_shipping_rate_providers)
      ? zone.carrier_shipping_rate_providers
      : [];
    carrierRates.forEach(provider => {
      const rate = normalizeRate({
        id: provider.id ? String(provider.id) : null,
        name: provider.name || 'Carrier-calculated rate',
        amount: null,
        source: 'carrier_or_calculated',
        profileName: 'Shopify shipping zones',
        zoneId: zoneSummary.id,
        zoneName: zoneSummary.name,
        countries,
      });
      rates.push(rate);
      zoneSummary.rates.push(rate);
    });

    profiles[0].zones.push(zoneSummary);
  });

  return { profiles, rates };
}

function buildCurrentShippingSummary(rates = []) {
  const activeRates = rates.filter(rate => rate.active !== false);
  const pricedRates = activeRates.filter(rate => rate.amount !== null);
  const uniquePricedAmounts = new Map();
  pricedRates.forEach(rate => {
    uniquePricedAmounts.set(`${rate.currency}:${Number(rate.amount).toFixed(2)}`, rate);
  });

  const inferredBaselineRate =
    uniquePricedAmounts.size === 1 && activeRates.length === pricedRates.length
      ? Array.from(uniquePricedAmounts.values())[0]
      : null;

  return {
    total_rates: activeRates.length,
    manual_rate_count: pricedRates.length,
    calculated_rate_count: activeRates.length - pricedRates.length,
    inferred_baseline_rate: inferredBaselineRate
      ? {
          amount: inferredBaselineRate.amount,
          currency: inferredBaselineRate.currency,
          formatted_amount:
            inferredBaselineRate.formatted_amount ||
            moneyText(inferredBaselineRate.amount, inferredBaselineRate.currency),
          name: inferredBaselineRate.name,
        }
      : null,
    can_infer_single_flat_rate: Boolean(inferredBaselineRate),
  };
}

async function fetchDeliveryProfilesCurrentSetup(shopDomain, accessToken) {
  const query = `
    query RipxDeliveryProfilesCurrentSetup {
      deliveryProfiles(first: 20) {
        edges {
          node {
            id
            name
            default
            profileLocationGroups {
              locationGroup {
                id
              }
              locationGroupZones(first: 30) {
                edges {
                  node {
                    zone {
                      id
                      name
                      countries {
                        code {
                          countryCode
                        }
                        name
                      }
                    }
                    methodDefinitions(first: 30) {
                      edges {
                        node {
                          id
                          name
                          active
                          rateProvider {
                            __typename
                            ... on DeliveryRateDefinition {
                              id
                              price {
                                amount
                                currencyCode
                              }
                            }
                            ... on DeliveryParticipant {
                              id
                              adaptToNewServicesFlag
                              percentageOfRateFee
                              fixedFee {
                                amount
                                currencyCode
                              }
                              carrierService {
                                id
                                name
                                callbackUrl
                                active
                                supportsServiceDiscovery
                              }
                              participantServices {
                                name
                                active
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    query,
    {},
    { apiVersion: '2025-04' }
  );
  return parseGraphqlDeliveryProfiles(response);
}

async function fetchRestShippingZonesCurrentSetup(shopDomain, accessToken) {
  const response = await shopifyService.requestAdminRest(shopDomain, accessToken, {
    method: 'GET',
    path: 'shipping_zones.json',
    apiVersion: '2025-04',
  });
  return parseRestShippingZones(response);
}

async function buildShippingCurrentSetupReport(shopDomain, accessToken) {
  const warnings = [];
  let source = 'delivery_profiles';
  let parsed;

  try {
    parsed = await fetchDeliveryProfilesCurrentSetup(shopDomain, accessToken);
    if (!Array.isArray(parsed?.rates) || parsed.rates.length === 0) {
      warnings.push(
        'Delivery profiles did not return configured rates; checked legacy shipping zones as fallback.'
      );
      try {
        const fallbackParsed = await fetchRestShippingZonesCurrentSetup(shopDomain, accessToken);
        if (Array.isArray(fallbackParsed?.rates) && fallbackParsed.rates.length > 0) {
          parsed = fallbackParsed;
          source = 'shipping_zones';
        }
      } catch (fallbackError) {
        warnings.push(
          `Could not read legacy shipping zones: ${fallbackError.message || 'unknown error'}`
        );
      }
    }
  } catch (error) {
    warnings.push(
      `Could not read delivery profiles through Admin GraphQL: ${error.message || 'unknown error'}`
    );
    source = 'shipping_zones';
    parsed = await fetchRestShippingZonesCurrentSetup(shopDomain, accessToken);
  }

  const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
  const rates = Array.isArray(parsed?.rates) ? parsed.rates : [];

  return {
    source,
    profiles,
    rates,
    summary: buildCurrentShippingSummary(rates),
    warnings,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildShippingCurrentSetupReport,
  buildCurrentShippingSummary,
  parseGraphqlDeliveryProfiles,
  parseRestShippingZones,
};
