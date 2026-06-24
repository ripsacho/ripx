const { normalizeShippingVariantConfig } = require('./shippingTestConfigService');
const { formatCarrierRateForCheckout } = require('./shippingCarrierRateFormatter');

function toFiniteNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toNormalizedString(value) {
  return String(value || '').trim();
}

function toLowerString(value) {
  return toNormalizedString(value).toLowerCase();
}

function firstPresent(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
}

function parseCountryRateMap(input) {
  if (Array.isArray(input)) {
    return input
      .map(entry => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        return {
          country: String(entry.country || entry.code || '')
            .trim()
            .toUpperCase(),
          amount: toFiniteNumber(entry.amount),
          label: toNormalizedString(entry.label || ''),
          description: toNormalizedString(entry.description || ''),
          delivery_promise: entry.delivery_promise || entry.deliveryPromise || null,
        };
      })
      .filter(entry => entry && entry.country && Number.isFinite(entry.amount));
  }
  const text = toNormalizedString(input);
  if (!text) {
    return [];
  }
  return text
    .split(',')
    .map(chunk => {
      const [countryRaw, amountRaw] = chunk.split(':');
      const country = String(countryRaw || '')
        .trim()
        .toUpperCase();
      const amount = toFiniteNumber(amountRaw);
      if (!country || !Number.isFinite(amount)) {
        return null;
      }
      return { country, amount, label: '', description: '', delivery_promise: null };
    })
    .filter(Boolean);
}

function resolveVariantProviderConfig(variant = {}) {
  const config = normalizeShippingVariantConfig(variant?.config || {});
  const metadata = config?.metadata && typeof config.metadata === 'object' ? config.metadata : {};
  const primaryRate =
    Array.isArray(config.rates) && config.rates[0] && typeof config.rates[0] === 'object'
      ? config.rates[0]
      : null;
  const provider = toLowerString(
    metadata.quote_provider ||
      metadata.quoteProvider ||
      metadata.provider ||
      variant?.quote_provider
  );
  const amount =
    toFiniteNumber(
      firstPresent(
        metadata.quote_amount,
        metadata.quoteAmount,
        metadata.amount,
        primaryRate?.amount,
        config.amount
      )
    ) ?? null;
  const serviceName = toNormalizedString(
    firstPresent(
      metadata.quote_service_name,
      metadata.quoteServiceName,
      primaryRate?.name,
      primaryRate?.service_name,
      config.label
    )
  );
  const serviceCode = toNormalizedString(
    firstPresent(primaryRate?.service_code, primaryRate?.serviceCode)
  );
  const description = toNormalizedString(
    firstPresent(
      metadata.quote_description,
      metadata.quoteDescription,
      metadata.description,
      primaryRate?.description,
      config.checkout_display?.default_description
    )
  );
  const replaceExistingRates =
    config.shipping_display_mode === 'replace_existing_methods' ||
    config.replace_existing_rates === true;
  const countryRates = parseCountryRateMap(
    metadata.country_rates ||
      metadata.countryRates ||
      metadata.quote_rate_table ||
      metadata.quoteRateTable
  );
  return {
    provider: provider || '',
    amount,
    service_name: serviceName,
    service_code: serviceCode,
    replace_existing_rates: replaceExistingRates,
    description,
    checkout_display: config.checkout_display,
    delivery_promise:
      primaryRate?.delivery_promise ||
      primaryRate?.deliveryPromise ||
      metadata.delivery_promise ||
      metadata.deliveryPromise ||
      null,
    country_rates: countryRates,
  };
}

function resolveQuoteServiceCode({ providerConfig = {}, serviceCodeBase = 'shipping' } = {}) {
  const configured = toNormalizedString(providerConfig.service_code);
  if (configured) {
    return configured;
  }
  const base = toNormalizedString(serviceCodeBase) || 'shipping';
  return providerConfig.replace_existing_rates ? `ripx_replace_${base}` : `ripx_quote_${base}`;
}

function buildCarrierQuoteRate({
  serviceName,
  serviceCode,
  amount,
  currency,
  providerConfig = {},
  deliveryPromise = null,
}) {
  return formatCarrierRateForCheckout({
    rateConfig: {
      name: serviceName,
      service_code: serviceCode,
      amount,
      currency,
      description: providerConfig.description || '',
      delivery_promise: deliveryPromise || providerConfig.delivery_promise || null,
    },
    variantConfig: {
      checkout_display: providerConfig.checkout_display || {},
    },
    serviceName,
    fallbackAmount: amount,
    fallbackCurrency: currency,
  });
}

function resolveCarrierQuoteRates({
  providerConfig = {},
  currency = 'USD',
  serviceName = 'RipX Shipping Quote',
  serviceCodeBase = 'shipping',
  destinationCountry = '',
}) {
  const provider = toLowerString(providerConfig.provider || '');
  if (!provider || provider === 'manual') {
    return {
      ok: false,
      status: 'manual_required',
      message: 'No carrier_quote provider is configured for this variant.',
      rates: [],
      provider: provider || 'manual',
    };
  }

  if (provider === 'static_rate' || provider === 'static' || provider === 'flat_rate') {
    const amount = toFiniteNumber(providerConfig.amount);
    if (amount === null || amount < 0) {
      return {
        ok: false,
        status: 'manual_required',
        message: 'static_rate provider requires a non-negative quote amount.',
        rates: [],
        provider,
      };
    }
    return {
      ok: true,
      status: 'resolved',
      message: 'Carrier quote resolved by static_rate provider.',
      provider,
      rates: [
        buildCarrierQuoteRate({
          serviceName: providerConfig.service_name || serviceName,
          serviceCode: resolveQuoteServiceCode({ providerConfig, serviceCodeBase }),
          amount,
          currency,
          providerConfig,
          deliveryPromise: providerConfig.delivery_promise,
        }),
      ],
    };
  }

  if (provider === 'country_table') {
    const rates = Array.isArray(providerConfig.country_rates) ? providerConfig.country_rates : [];
    const normalizedCountry = String(destinationCountry || '')
      .trim()
      .toUpperCase();
    const match =
      rates.find(entry => entry.country === normalizedCountry) ||
      rates.find(entry => entry.country === '*') ||
      null;
    if (!match || !Number.isFinite(match.amount)) {
      return {
        ok: false,
        status: 'manual_required',
        message: 'country_table provider has no rate for this destination.',
        rates: [],
        provider,
      };
    }
    return {
      ok: true,
      status: 'resolved',
      message: 'Carrier quote resolved by country_table provider.',
      provider,
      rates: [
        buildCarrierQuoteRate({
          serviceName: match.label || providerConfig.service_name || serviceName,
          serviceCode: resolveQuoteServiceCode({ providerConfig, serviceCodeBase }),
          amount: match.amount,
          currency,
          providerConfig: {
            ...providerConfig,
            description: match.description || providerConfig.description || '',
          },
          deliveryPromise: match.delivery_promise || match.deliveryPromise || null,
        }),
      ],
    };
  }

  return {
    ok: false,
    status: 'manual_required',
    message: `Unsupported carrier_quote provider: ${provider}.`,
    rates: [],
    provider,
  };
}

module.exports = {
  resolveVariantProviderConfig,
  resolveCarrierQuoteRates,
};
