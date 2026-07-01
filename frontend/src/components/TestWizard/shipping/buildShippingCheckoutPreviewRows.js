import {
  matchesDeliveryMethodTitle,
  partitionNativeShippingRates,
} from '../../../utils/shippingConfig/deliveryMethodMatching';

export function formatNativeShippingRateAmount(rate) {
  if (rate?.formatted_amount) return rate.formatted_amount;
  const amount = Number(rate?.amount);
  if (!Number.isFinite(amount)) return 'Current Shopify rate';
  const currency = String(rate?.currency || 'USD').toUpperCase();
  return `${currency} ${amount.toFixed(2)}`;
}

function mergeNativeShippingMethods(methods = []) {
  const grouped = new Map();
  methods.forEach(method => {
    const name = String(method?.name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, { name, rate: method, sources: [method] });
      return;
    }
    const existing = grouped.get(key);
    existing.sources.push(method);
  });
  return Array.from(grouped.values());
}

function resolveHiddenMethodLabels(methods = [], hideNames = []) {
  const labels = [];
  hideNames.forEach(name => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    const matched = methods.some(method => matchesDeliveryMethodTitle(method?.name, [trimmed]));
    labels.push(matched ? trimmed : trimmed);
  });
  return Array.from(new Set(labels));
}

export function buildShippingCheckoutPreviewRows({
  usesControlView = false,
  shippingCurrentRates = [],
  activeDeliveryMethodNames = [],
  activeSelectedMethodIds = [],
  activeDeliveryMethodCodes = [],
  activeConfiguredRates = [],
  replacesExistingRates = false,
  checkoutPreviewTitle = '',
  checkoutPreviewPrice = '',
  checkoutPreviewDescription = '',
  checkoutPreviewPromiseLabel = '',
} = {}) {
  const hideNames = activeDeliveryMethodNames
    .map(name => String(name || '').trim())
    .filter(Boolean);
  const hideIds = activeSelectedMethodIds.map(id => String(id || '').trim()).filter(Boolean);
  const hideCodes = activeDeliveryMethodCodes
    .map(code => String(code || '').trim())
    .filter(Boolean);
  const hasHideTargets = hideNames.length > 0 || hideIds.length > 0 || hideCodes.length > 0;
  const nativeMethods = mergeNativeShippingMethods(shippingCurrentRates);
  const partitioned = partitionNativeShippingRates(
    nativeMethods.map(entry => entry.rate),
    {
      hideNames,
      hideIds,
      hideCodes,
    }
  );
  const hiddenRateKeys = new Set(
    partitioned.hidden.map(rate =>
      String(rate?.name || '')
        .trim()
        .toLowerCase()
    )
  );
  const visibleNativeMethods =
    usesControlView || !hasHideTargets
      ? nativeMethods
      : nativeMethods.filter(entry => !hiddenRateKeys.has(entry.name.toLowerCase()));
  const hiddenNativeMethods =
    usesControlView || !hasHideTargets
      ? []
      : nativeMethods.filter(entry => hiddenRateKeys.has(entry.name.toLowerCase()));

  const variantPreviewRows = (() => {
    if (usesControlView) return [];
    if (activeConfiguredRates.length > 0) {
      return activeConfiguredRates.map((rate, index) => ({
        key: `variant-rate-${index}`,
        title:
          String(rate?.name || checkoutPreviewTitle || 'RipX Shipping').trim() || 'RipX Shipping',
        price: Number.isFinite(Number(rate?.amount))
          ? `${String(rate?.currency || 'USD').toUpperCase()} ${Number(rate.amount).toFixed(2)}`
          : checkoutPreviewPrice,
        description:
          String(rate?.description || '').trim() ||
          checkoutPreviewDescription ||
          'RipX variant shipping option',
        promiseLabel: checkoutPreviewPromiseLabel,
        tone: 'variant',
      }));
    }
    if (checkoutPreviewTitle) {
      return [
        {
          key: 'variant-rate-fallback',
          title: checkoutPreviewTitle,
          price: checkoutPreviewPrice,
          description: checkoutPreviewDescription || 'RipX variant shipping option',
          promiseLabel: checkoutPreviewPromiseLabel,
          tone: 'variant',
        },
      ];
    }
    return [];
  })();

  const checkoutRows = (() => {
    if (usesControlView) {
      return [
        {
          key: 'control-native',
          title: 'Shopify live shipping method',
          price: 'Current price',
          description: 'Control uses your live Shopify shipping labels.',
          promiseLabel: 'Delivery promise comes from Shopify settings.',
          tone: 'native',
        },
      ];
    }
    const nativeRows = visibleNativeMethods.map(method => ({
      key: `native-${method.name}`,
      title: method.name,
      price: formatNativeShippingRateAmount(method.rate),
      description: replacesExistingRates
        ? 'Native method stays visible until you select it in Step 2.'
        : 'Existing Shopify method stays visible for this variant.',
      promiseLabel: 'Shopify delivery settings',
      tone: 'native',
    }));
    return [...nativeRows, ...variantPreviewRows];
  })();

  const previewCaption = (() => {
    if (usesControlView) {
      return 'Control keeps Shopify checkout unchanged.';
    }
    if (!hasHideTargets) {
      return 'No Step 2 hide targets selected. Native methods such as Standard remain visible beside your RipX rate.';
    }
    const hiddenLabels = resolveHiddenMethodLabels(
      shippingCurrentRates,
      hideNames.length > 0 ? hideNames : hiddenNativeMethods.map(entry => entry.name)
    );
    if (hiddenLabels.length > 0) {
      return `Step 2 hides ${hiddenLabels.join(', ')} for this variant.`;
    }
    return 'Configured hide targets apply only to the methods selected in Step 2.';
  })();

  return {
    checkoutRows,
    previewCaption,
    hiddenNativeMethods: hiddenNativeMethods.map(entry => ({ name: entry.name, rate: entry.rate })),
    visibleNativeMethods: visibleNativeMethods.map(entry => ({
      name: entry.name,
      rate: entry.rate,
    })),
  };
}
