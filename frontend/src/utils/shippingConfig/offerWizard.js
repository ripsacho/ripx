import { formatShippingDeliveryPromiseLabel } from './deliveryPromiseDisplay';

export const SHIPPING_OFFER_MODES = ['single', 'multiple'];

export const SHIPPING_OFFER_ATTRIBUTE_KEYS = ['name', 'rate', 'range', 'message'];

export const SHIPPING_OFFER_ATTRIBUTE_OPTIONS = [
  {
    key: 'name',
    label: 'Update rate name',
    description: 'Change the shipping method title shoppers see in checkout.',
    baselineKey: 'name',
  },
  {
    key: 'rate',
    label: 'Update price',
    description: 'Change the amount charged for the new RipX shipping option.',
    baselineKey: 'rate',
  },
  {
    key: 'range',
    label: 'Update delivery range',
    description: 'Change the delivery promise or custom date range.',
    baselineKey: 'range',
  },
  {
    key: 'message',
    label: 'Update promise text',
    description: 'Change the delivery text shown under the shipping method title.',
    baselineKey: 'message',
  },
];

export const DEFAULT_SHIPPING_OFFER_ATTRIBUTES = {
  name: true,
  rate: true,
  range: true,
  message: true,
};

export function normalizeShippingOfferMode(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return SHIPPING_OFFER_MODES.includes(normalized) ? normalized : 'single';
}

export function getShippingOfferMode(cfg = {}) {
  const metadata = cfg.metadata && typeof cfg.metadata === 'object' ? cfg.metadata : {};
  const fromMetadata = normalizeShippingOfferMode(
    metadata.shipping_offer_mode || metadata.shippingOfferMode
  );
  if (metadata.shipping_offer_mode || metadata.shippingOfferMode) {
    return fromMetadata;
  }
  const rates = Array.isArray(cfg.rates) ? cfg.rates : [];
  return rates.length > 1 ? 'multiple' : 'single';
}

export function normalizeShippingOfferAttributes(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return SHIPPING_OFFER_ATTRIBUTE_KEYS.reduce((acc, key) => {
    const explicit = source[key];
    const legacyKey =
      key === 'name'
        ? (source.update_name ?? source.updateName)
        : key === 'rate'
          ? (source.update_rate ?? source.updateRate)
          : key === 'range'
            ? (source.update_range ?? source.updateRange)
            : (source.update_message ?? source.updateMessage);
    const value = explicit ?? legacyKey;
    acc[key] =
      value === undefined || value === null
        ? DEFAULT_SHIPPING_OFFER_ATTRIBUTES[key]
        : Boolean(value);
    return acc;
  }, {});
}

export function getShippingOfferAttributes(cfg = {}) {
  const metadata = cfg.metadata && typeof cfg.metadata === 'object' ? cfg.metadata : {};
  const fromCheckoutOffer =
    cfg.checkout_offer?.attributes && typeof cfg.checkout_offer.attributes === 'object'
      ? cfg.checkout_offer.attributes
      : cfg.checkoutOffer?.attributes;
  const fromMetadata =
    metadata.shipping_offer_attributes ||
    metadata.shippingOfferAttributes ||
    metadata.checkout_offer_attributes;
  return normalizeShippingOfferAttributes(fromCheckoutOffer || fromMetadata || {});
}

export function buildShippingOfferAttributesPatch(attributes = {}) {
  return normalizeShippingOfferAttributes(attributes);
}

export function getShippingOfferAttributeLabels() {
  return SHIPPING_OFFER_ATTRIBUTE_OPTIONS.reduce((acc, option) => {
    acc[option.key] = option.label;
    return acc;
  }, {});
}

export function isOfferWizardConfig(cfg = {}) {
  const metadata = cfg.metadata && typeof cfg.metadata === 'object' ? cfg.metadata : {};
  const wizardPath = String(metadata.shipping_wizard_path || metadata.shippingWizardPath || '')
    .trim()
    .toLowerCase();
  if (wizardPath === 'advanced') return false;
  if (wizardPath === 'offer') return true;
  return Boolean(
    metadata.shipping_offer_mode ||
    metadata.shippingOfferMode ||
    metadata.shipping_offer_attributes ||
    metadata.shippingOfferAttributes
  );
}

function hasConfiguredOfferRate(cfg = {}, attributes = {}) {
  const amount = cfg.amount ?? cfg.rate ?? cfg.shipping_rate;
  const numericAmount =
    amount === null || amount === undefined || amount === '' ? null : Number(amount);
  const rates = Array.isArray(cfg.rates) ? cfg.rates : [];
  const hasRateRow = rates.some(rate => {
    const value = rate?.amount;
    if (value === null || value === undefined || value === '') return false;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
  });
  if (!attributes.rate) return true;
  if (hasRateRow) return true;
  return numericAmount !== null && Number.isFinite(numericAmount) && numericAmount >= 0;
}

function hasConfiguredOfferName(cfg = {}, attributes = {}) {
  if (!attributes.name) return true;
  const label = String(cfg.label || '').trim();
  if (label) return true;
  const rates = Array.isArray(cfg.rates) ? cfg.rates : [];
  return rates.some(rate => String(rate?.name || rate?.service_name || '').trim());
}

export function getOfferWizardReadinessIssues(cfg = {}, { normalizeRates = rates => rates } = {}) {
  if (!isOfferWizardConfig(cfg)) return [];
  const mode = getShippingOfferMode(cfg);
  const attributes = getShippingOfferAttributes(cfg);
  const rates = normalizeRates(cfg);
  const issues = [];

  if (mode === 'multiple' && rates.length < 2) {
    issues.push('Multiple shipping mode needs at least two rate rows.');
  }
  if (!hasConfiguredOfferRate(cfg, attributes)) {
    issues.push('Add a checkout price for the new shipping offer.');
  }
  if (!hasConfiguredOfferName(cfg, attributes)) {
    issues.push('Add a checkout rate name for the new shipping offer.');
  }

  const inspectPromise = (promise, label) => {
    const normalized =
      promise && typeof promise === 'object' ? promise : { mode: 'none', preset: 'none' };
    if (!attributes.range) return;
    if (normalized.mode === 'custom') {
      const minDate = String(normalized.min_delivery_date || '').trim();
      const maxDate = String(normalized.max_delivery_date || '').trim();
      if (!minDate && !maxDate) {
        issues.push(`${label}: add a custom delivery date range or choose another promise.`);
      }
      if (minDate && maxDate && minDate > maxDate) {
        issues.push(`${label}: delivery date range is invalid.`);
      }
    }
  };

  if (mode === 'single') {
    const checkoutDisplay =
      cfg.checkout_display && typeof cfg.checkout_display === 'object' ? cfg.checkout_display : {};
    inspectPromise(checkoutDisplay.delivery_promise, 'Delivery promise');
  } else {
    rates.forEach((rate, index) => {
      inspectPromise(rate?.delivery_promise, `Rate ${index + 1} delivery promise`);
    });
  }

  return issues;
}

function slugifyNativeDeliveryMethodCode(value, index = 0) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `method_${index + 1}`;
}

export function buildNativeDeliveryMethodCodes(methodNames = []) {
  const codes = [];
  methodNames.forEach((name, index) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    codes.push(trimmed);
    codes.push(trimmed.toLowerCase());
    codes.push(slugifyNativeDeliveryMethodCode(trimmed, index));
    codes.push(
      String(trimmed)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    );
  });
  return Array.from(new Set(codes.filter(Boolean))).slice(0, 50);
}

export function buildOfferAttributeRevertPatch(cfg = {}, attributeKey, baseline = {}) {
  const normalizedKey = String(attributeKey || '').trim();
  if (!normalizedKey) return {};
  const metadata = cfg.metadata && typeof cfg.metadata === 'object' ? { ...cfg.metadata } : {};
  const checkoutDisplay =
    cfg.checkout_display && typeof cfg.checkout_display === 'object'
      ? { ...cfg.checkout_display }
      : {};
  const rates = Array.isArray(cfg.rates) ? cfg.rates.map(rate => ({ ...rate })) : [];
  const patch = {};

  if (normalizedKey === 'name') {
    patch.label = baseline.name;
    patch.metadata = {
      ...metadata,
      quote_service_name: baseline.name,
    };
    if (rates.length > 0) {
      patch.rates = rates.map(rate => ({ ...rate, name: baseline.name }));
    }
  }

  if (normalizedKey === 'rate') {
    patch.amount = baseline.rate;
    patch.metadata = {
      ...(patch.metadata || metadata),
      quote_amount: baseline.rate,
    };
    if (rates.length > 0) {
      patch.rates = rates.map(rate => ({ ...rate, amount: baseline.rate }));
    }
  }

  if (normalizedKey === 'message') {
    patch.checkout_display = {
      ...checkoutDisplay,
      default_description: baseline.message,
    };
    if (rates.length > 0) {
      patch.rates = (patch.rates || rates).map(rate => ({
        ...rate,
        description: baseline.message,
      }));
    }
  }

  if (normalizedKey === 'range') {
    patch.checkout_display = {
      ...(patch.checkout_display || checkoutDisplay),
      delivery_promise: baseline.range,
    };
    if (rates.length > 0) {
      patch.rates = (patch.rates || rates).map(rate => ({
        ...rate,
        delivery_promise: baseline.range,
      }));
    }
  }

  return patch;
}

export function resolveControlShippingBaseline({
  controlVariant = null,
  currentSetup = null,
  inferredRate = null,
} = {}) {
  const controlConfig =
    controlVariant?.config && typeof controlVariant.config === 'object'
      ? controlVariant.config
      : {};
  const controlDisplay =
    controlConfig.checkout_display && typeof controlConfig.checkout_display === 'object'
      ? controlConfig.checkout_display
      : {};
  const baselineRate = inferredRate || currentSetup?.summary?.inferred_baseline_rate || null;
  return {
    name: String(baselineRate?.name || 'Standard').trim() || 'Standard',
    rate:
      baselineRate?.amount !== undefined && baselineRate?.amount !== null
        ? baselineRate.amount
        : null,
    message: String(controlDisplay.default_description || '').trim(),
    range: controlDisplay.delivery_promise || { mode: 'none', preset: 'none' },
  };
}

export function formatShippingOfferBaselineValue(key, baseline = {}) {
  if (key === 'name') {
    return String(baseline.name || 'Standard').trim() || 'Standard';
  }
  if (key === 'rate') {
    return baseline.rate === null || baseline.rate === undefined || baseline.rate === ''
      ? 'Uses Shopify control pricing'
      : `$${Number(baseline.rate).toFixed(2)}`;
  }
  if (key === 'message') {
    return String(baseline.message || '').trim() || 'No checkout subline';
  }
  if (key === 'range') {
    return formatShippingDeliveryPromiseLabel(baseline.range || {});
  }
  return 'Control default';
}
