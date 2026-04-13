const { normalizeShippingVariantConfig } = require('./shippingTestConfigService');

function toFiniteNumber(value) {
  const parsed = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toNormalizedString(value) {
  return String(value || '').trim();
}

function toLowerString(value) {
  return toNormalizedString(value).toLowerCase();
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
      return { country, amount, label: '' };
    })
    .filter(Boolean);
}

function resolveVariantProviderConfig(variant = {}) {
  const config = normalizeShippingVariantConfig(variant?.config || {});
  const metadata = config?.metadata && typeof config.metadata === 'object' ? config.metadata : {};
  const provider = toLowerString(
    metadata.quote_provider ||
      metadata.quoteProvider ||
      metadata.provider ||
      variant?.quote_provider
  );
  const amount =
    toFiniteNumber(metadata.quote_amount || metadata.quoteAmount || metadata.amount) ??
    toFiniteNumber(variant?.config?.amount);
  const serviceName = toNormalizedString(
    metadata.quote_service_name || metadata.quoteServiceName || metadata.label || config.label
  );
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
    country_rates: countryRates,
  };
}

function buildCarrierQuoteRate({ serviceName, serviceCode, amount, currency }) {
  return {
    service_name: serviceName,
    service_code: serviceCode,
    total_price: String(Math.max(0, Math.round(amount * 100))),
    currency,
  };
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
          serviceCode: `ripx_quote_${serviceCodeBase}`,
          amount,
          currency,
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
          serviceCode: `ripx_quote_${serviceCodeBase}`,
          amount: match.amount,
          currency,
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
