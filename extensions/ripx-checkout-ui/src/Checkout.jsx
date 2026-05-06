import '@shopify/ui-extensions/preact';
import { h, render } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  useApplyDiscountCodeChange,
  useAttributes,
  useCartLines,
  useCheckoutToken,
  useDiscountCodes,
  useShop,
} from '@shopify/ui-extensions/checkout/preact';
import {
  RIPX_CHECKOUT_ASSIGNMENT_URL,
  RIPX_CHECKOUT_CONVERSION_URL,
  RIPX_CHECKOUT_PRICE_SECRET,
  RIPX_CHECKOUT_UI_SHOP_DOMAIN,
  RIPX_CHECKOUT_UI_TEST_ID,
} from './ripxConfig.generated';

function normalizeShopDomain(input) {
  const raw = String(input || '')
    .trim()
    .toLowerCase();
  if (!raw) {
    return '';
  }
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(raw)) {
    return raw;
  }
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = String(parsed.hostname || '').toLowerCase();
    if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) {
      return host;
    }
  } catch (_) {
    return '';
  }
  return '';
}

function getAttribute(attributes, key) {
  const rows = Array.isArray(attributes) ? attributes : [];
  const hit = rows.find(row => String(row?.key || '').trim() === key);
  return String(hit?.value || '').trim();
}

function getLineAttribute(line, key) {
  const attrs = Array.isArray(line?.attributes) ? line.attributes : [];
  const hit = attrs.find(row => String(row?.key || '').trim() === key);
  return String(hit?.value || '').trim();
}

function getAssignmentVariantFromCartLines(lines, testId) {
  const rows = Array.isArray(lines) ? lines : [];
  const targetTestId = String(testId || '').trim();
  for (const line of rows) {
    const lineTestId = getLineAttribute(line, '_ripx_price_test');
    if (targetTestId && lineTestId && lineTestId !== targetTestId) {
      continue;
    }
    const variant = getLineAttribute(line, '_ripx_variant');
    if (variant) {
      return variant;
    }
  }
  return '';
}

function normalizeOfferCodeToken(rawValue, fallback = 'VARIANT') {
  const token = String(rawValue || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  return token || String(fallback || 'VARIANT');
}

function buildOfferValueToken(config = {}) {
  const discountType = normalizeOfferDiscountType(config);
  if (discountType === 'free_shipping') {
    return 'SHIP';
  }
  const numericValue = parseOfferDiscountValue(config);
  const valueToken = Number.isFinite(numericValue)
    ? String(numericValue).replace('.', '_')
    : discountType === 'fixed'
      ? 'FIXED'
      : 'PCT';
  if (discountType === 'fixed') {
    return `${valueToken}OFF`;
  }
  return `${valueToken}PCT`;
}

function buildAutoOfferCodeName(testId, variantName, config = {}) {
  const testToken = normalizeOfferCodeToken(testId, 'TEST').slice(0, 14);
  const variantToken = normalizeOfferCodeToken(variantName, 'VARIANT').slice(0, 14);
  const offerToken = normalizeOfferCodeToken(buildOfferValueToken(config), 'OFFER').slice(0, 14);
  return `RIPX-${testToken}-${variantToken}-${offerToken}`.slice(0, 48);
}

function getOfferConfigCandidates(config = {}) {
  const base = config && typeof config === 'object' ? config : {};
  const out = [base];
  const nestedKeys = ['offer', 'discount', 'offer_config', 'offerConfig'];
  for (const key of nestedKeys) {
    const nested = base[key];
    if (nested && typeof nested === 'object') {
      out.push(nested);
    }
  }
  return out;
}

function normalizeExplicitOfferCode(rawValue) {
  const code = String(rawValue === null || rawValue === undefined ? '' : rawValue).trim();
  if (!code) {
    return '';
  }
  if (code.length > 64) {
    return '';
  }
  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    return '';
  }
  return code;
}

function resolveExplicitOfferCodeFromConfig(config = {}, labelPrefix = 'config') {
  const sourceKeys = [
    'discount_code_name',
    'discountCodeName',
    'discount_code',
    'discountCode',
    'code_name',
    'codeName',
    'coupon_code',
    'couponCode',
    'coupon',
    'code',
  ];
  const nestedLabels = ['', 'offer', 'discount', 'offer_config', 'offerConfig'];
  const candidates = getOfferConfigCandidates(config);
  for (let i = 0; i < candidates.length; i += 1) {
    const cfg = candidates[i];
    for (const key of sourceKeys) {
      const code = normalizeExplicitOfferCode(cfg[key]);
      if (code) {
        const nestedLabel = nestedLabels[i];
        const sourcePath = nestedLabel ? `${nestedLabel}.${key}` : key;
        return {
          codeName: code,
          sourceKey: key,
          sourceLabel: `${labelPrefix}.${sourcePath}`,
        };
      }
    }
  }
  return null;
}

function resolveOfferCodeFromConfig(
  config = {},
  testId = 'test',
  variantName = 'Assigned',
  variantPayload = null
) {
  const explicit = resolveExplicitOfferCodeFromConfig(config, 'config');
  if (explicit) {
    return explicit;
  }
  if (variantPayload && typeof variantPayload === 'object') {
    const variantLevel = resolveExplicitOfferCodeFromConfig(variantPayload, 'variant');
    if (variantLevel) {
      return variantLevel;
    }
  }
  return {
    codeName: buildAutoOfferCodeName(testId, variantName, config),
    sourceKey: 'auto',
    sourceLabel: 'auto-generated',
  };
}

function normalizeOfferDiscountType(config = {}) {
  let raw = '';
  const candidates = getOfferConfigCandidates(config);
  for (const cfg of candidates) {
    raw = String(
      cfg.discount_type || cfg.discountType || cfg.offer_type || cfg.offerType || cfg.type || ''
    )
      .trim()
      .toLowerCase();
    if (raw) {
      break;
    }
  }
  if (
    raw === 'percent' ||
    raw === 'percentage' ||
    raw === 'pct' ||
    raw === 'percent_off' ||
    raw === 'percentage_off'
  ) {
    return 'percent';
  }
  if (
    raw === 'fixed' ||
    raw === 'fixed_amount' ||
    raw === 'amount' ||
    raw === 'flat' ||
    raw === 'flat_amount' ||
    raw === 'money'
  ) {
    return 'fixed';
  }
  if (
    raw === 'free_shipping' ||
    raw === 'free-shipping' ||
    raw === 'freeshipping' ||
    raw === 'free shipping'
  ) {
    return 'free_shipping';
  }
  if (!raw) {
    const inferredValue = parseOfferDiscountValue(config);
    if (Number.isFinite(inferredValue) && inferredValue > 0) {
      return 'percent';
    }
  }
  return raw;
}

function parseOfferDiscountValue(config = {}) {
  const cfgCandidates = getOfferConfigCandidates(config);
  for (const cfg of cfgCandidates) {
    const candidates = [
      cfg.discount_value,
      cfg.discountValue,
      cfg.discount_amount,
      cfg.discountAmount,
      cfg.value,
      cfg.amount,
      cfg.percent,
      cfg.percentage,
      cfg.pct,
    ];
    for (const raw of candidates) {
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        continue;
      }
      const n = Number(raw);
      if (Number.isFinite(n) && n !== 0) {
        return Math.abs(n);
      }
    }
  }
  return NaN;
}

function isActionableOfferConfig(config = {}) {
  const discountType = normalizeOfferDiscountType(config);
  if (discountType === 'free_shipping') {
    return true;
  }
  if (resolveExplicitOfferCodeFromConfig(config, 'config')) {
    return true;
  }
  if (discountType !== 'percent' && discountType !== 'fixed') {
    return false;
  }
  const value = parseOfferDiscountValue(config);
  return Number.isFinite(value) && value > 0;
}

function normalizeCheckoutTone(rawValue) {
  const value = String(rawValue || 'success')
    .trim()
    .toLowerCase();
  return ['success', 'info', 'warning', 'critical'].includes(value) ? value : 'success';
}

function normalizeCheckoutLayout(rawValue) {
  const value = String(rawValue || 'banner')
    .trim()
    .toLowerCase();
  return ['banner', 'stacked', 'compact'].includes(value) ? value : 'banner';
}

function normalizeCheckoutPhase(rawValue) {
  const value = String(rawValue || 'experience')
    .trim()
    .toLowerCase();
  return ['experience', 'payment_method', 'delivery_method'].includes(value) ? value : 'experience';
}

function parseCheckoutFeatureBullets(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(rawValue || '')
    .split(/\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
}

function parseCheckoutProductItems(rawValue) {
  const rows = Array.isArray(rawValue) ? rawValue : [];
  return rows
    .map((item, index) => {
      const source = item && typeof item === 'object' ? item : {};
      const imageUrl = String(
        source.image_url || source.image || source.product_image_url || ''
      ).trim();
      const title = String(source.title || source.product_title || '').trim();
      const subtitle = String(source.subtitle || source.product_subtitle || '').trim();
      const price = String(source.price || source.product_price || '').trim();
      const compareAtPrice = String(
        source.compare_at_price || source.product_compare_at_price || ''
      ).trim();
      const badgeText = String(source.badge_text || source.product_badge_text || '').trim();
      if (!source || typeof source !== 'object') {
        return null;
      }
      return {
        id:
          String(source.id || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '') || `product-${index + 1}`,
        image_url: imageUrl,
        title,
        subtitle,
        price,
        compare_at_price: compareAtPrice,
        badge_text: badgeText,
      };
    })
    .filter(Boolean);
}

function hasRenderableCheckoutProductItem(item = {}) {
  return Boolean(
    item.image_url ||
    item.title ||
    item.subtitle ||
    item.price ||
    item.compare_at_price ||
    item.badge_text
  );
}

function getCartRelatedCheckoutProductItems(lines, limit = 3) {
  const rows = Array.isArray(lines) ? lines : [];
  const normalizedLimit = normalizeCheckoutProductSourceLimit(limit);
  const seen = new Set();
  const items = [];

  for (const line of rows) {
    const merchandise =
      line?.merchandise && typeof line.merchandise === 'object' ? line.merchandise : {};
    const rawId =
      merchandise?.id ||
      merchandise?.product?.id ||
      line?.id ||
      `${merchandise?.title || merchandise?.product?.title || 'cart-item'}-${items.length + 1}`;
    const dedupeKey = String(rawId || '')
      .trim()
      .toLowerCase();
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }

    const title = String(
      merchandise?.product?.title || merchandise?.title || line?.title || ''
    ).trim();
    const variantTitle = String(
      merchandise?.variantTitle || merchandise?.subtitle || line?.subtitle || ''
    ).trim();
    const imageUrl = String(
      merchandise?.image?.url || merchandise?.product?.featuredImage?.url || ''
    ).trim();
    const quantity = Number.isFinite(Number(line?.quantity)) ? Number(line.quantity) : 0;
    const totalAmount = String(
      line?.cost?.totalAmount?.amount || line?.cost?.subtotalAmount?.amount || ''
    ).trim();
    const currencyCode = String(line?.cost?.totalAmount?.currencyCode || '').trim();

    const item = {
      id: dedupeKey,
      image_url: imageUrl,
      title,
      subtitle: variantTitle || (quantity > 1 ? `Qty ${quantity}` : ''),
      price: totalAmount ? `${totalAmount}${currencyCode ? ` ${currencyCode}` : ''}` : '',
      compare_at_price: '',
      badge_text: quantity > 1 ? `${quantity} in cart` : 'In cart',
    };

    if (!hasRenderableCheckoutProductItem(item)) {
      continue;
    }

    seen.add(dedupeKey);
    items.push(item);
    if (items.length >= normalizedLimit) {
      break;
    }
  }

  return items;
}

function normalizeCheckoutSectionType(rawValue) {
  const value = String(rawValue || 'hero_notice')
    .trim()
    .toLowerCase();
  return [
    'hero_notice',
    'trust_box',
    'guarantee_box',
    'shipping_promise',
    'offer_code_panel',
    'product_list',
  ].includes(value)
    ? value
    : 'hero_notice';
}

function normalizeCheckoutCtaKind(rawValue) {
  const value = String(rawValue || 'track')
    .trim()
    .toLowerCase();
  return ['track', 'offer_code', 'none'].includes(value) ? value : 'track';
}

function normalizeCheckoutProductSourceMode(rawValue) {
  const value = String(rawValue || 'manual')
    .trim()
    .toLowerCase();
  return ['manual', 'cart_related', 'collection'].includes(value) ? value : 'manual';
}

function normalizeCheckoutProductSourceLimit(rawValue) {
  const numeric = Number.parseInt(String(rawValue ?? '3').trim(), 10);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.min(6, Math.max(1, numeric));
}

function normalizeCheckoutProductDisplayLayout(rawLayout) {
  const layout = String(rawLayout || 'stacked_cards')
    .trim()
    .toLowerCase();
  return ['stacked_cards', 'compact_rows', 'two_column_grid', 'comparison_table'].includes(layout)
    ? layout
    : 'stacked_cards';
}

function parseCheckoutProductSourceCollections(rawValue) {
  const rows = Array.isArray(rawValue) ? rawValue : [];
  return rows
    .map(item => {
      if (item && typeof item === 'object') {
        const id = String(item.id || item.collection_id || '').trim();
        if (!id) {
          return null;
        }
        return {
          id,
          title: String(item.title || item.name || item.collection_title || '').trim(),
          handle: String(item.handle || item.collection_handle || '').trim(),
        };
      }
      const id = String(item || '').trim();
      if (!id) {
        return null;
      }
      return {
        id,
        title: '',
        handle: '',
      };
    })
    .filter(Boolean)
    .filter(
      (item, index, items) => items.findIndex(candidate => candidate.id === item.id) === index
    );
}

function normalizeCheckoutSectionProps(rawSection = {}) {
  const source =
    rawSection.props && typeof rawSection.props === 'object'
      ? { ...rawSection, ...rawSection.props }
      : rawSection;
  return {
    title: String(source.title || source.checkout_title || '').trim(),
    message: String(source.message || source.checkout_message || '').trim(),
    badge_text: String(source.badge_text || source.checkout_badge_text || '').trim(),
    disclaimer: String(source.disclaimer || source.checkout_disclaimer || '').trim(),
    cta_label: String(source.cta_label || source.checkout_cta_label || '').trim(),
    tone: normalizeCheckoutTone(source.tone || source.checkout_tone),
    layout: normalizeCheckoutLayout(source.layout || source.checkout_layout),
    cta_kind: normalizeCheckoutCtaKind(source.cta_kind || source.checkout_cta_kind),
    feature_bullets: parseCheckoutFeatureBullets(
      source.feature_bullets || source.checkout_feature_bullets
    ),
    product_source_mode: normalizeCheckoutProductSourceMode(
      source.product_source_mode || source.checkout_product_source_mode
    ),
    product_source_limit: normalizeCheckoutProductSourceLimit(
      source.product_source_limit || source.checkout_product_source_limit
    ),
    product_display_layout: normalizeCheckoutProductDisplayLayout(
      source.product_display_layout || source.checkout_product_display_layout
    ),
    product_source_collections: parseCheckoutProductSourceCollections(
      source.product_source_collections ||
        source.checkout_product_source_collections ||
        source.product_source_collection_ids
    ),
    product_items: parseCheckoutProductItems(source.product_items || source.checkout_product_items),
  };
}

function hasRenderableCheckoutSection(section = {}) {
  const props = section?.props && typeof section.props === 'object' ? section.props : {};
  if (section.enabled === false) {
    return false;
  }
  return Boolean(
    props.title ||
    props.message ||
    props.badge_text ||
    props.disclaimer ||
    props.cta_label ||
    props.feature_bullets?.length ||
    props.product_source_mode === 'cart_related' ||
    (props.product_source_mode === 'collection' && props.product_source_collections?.length > 0) ||
    props.product_items?.some(hasRenderableCheckoutProductItem)
  );
}

function normalizeCheckoutSection(rawSection = {}, index = 0) {
  const type = normalizeCheckoutSectionType(rawSection.type);
  return {
    id:
      String(rawSection.id || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || `${type}-${index + 1}`,
    type,
    enabled: rawSection.enabled !== false,
    order: Number.isInteger(rawSection.order) ? rawSection.order : index,
    props: normalizeCheckoutSectionProps(rawSection),
  };
}

function getCheckoutSections(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  if (Array.isArray(source.checkout_sections) && source.checkout_sections.length > 0) {
    return source.checkout_sections
      .map((section, index) => normalizeCheckoutSection(section, index))
      .sort((left, right) => left.order - right.order);
  }
  const legacySection = normalizeCheckoutSection(
    {
      id: 'hero-notice-1',
      type: 'hero_notice',
      enabled: true,
      order: 0,
      props: source,
    },
    0
  );
  return hasRenderableCheckoutSection(legacySection) ? [legacySection] : [];
}

function inferCheckoutPhaseFromConfig(config = {}) {
  if (parseCheckoutFeatureBullets(config.payment_method_names).length > 0) {
    return 'payment_method';
  }
  if (parseCheckoutFeatureBullets(config.delivery_method_names).length > 0) {
    return 'delivery_method';
  }
  if (getCheckoutSections(config).length > 0) {
    return 'experience';
  }
  return 'experience';
}

const CHECKOUT_EVENT_NAMES = {
  impression: 'checkout_phase_impression',
  ctaClick: 'checkout_phase_cta_click',
  offerApplied: 'checkout_phase_offer_apply',
  conversion: 'checkout_phase_conversion',
  diagnostic: 'checkout_runtime_diagnostic',
  paymentMethodAction: 'checkout_payment_method_action',
  deliveryMethodAction: 'checkout_delivery_method_action',
  customizationMatch: 'checkout_customization_match',
  sectionImpression: 'checkout_section_impression',
  sectionCtaClick: 'checkout_section_cta_click',
  sectionOfferApplied: 'checkout_section_offer_apply',
};

function CheckoutExperiment() {
  const attributes = useAttributes() || [];
  const cartLines = useCartLines() || [];
  const checkoutToken = useCheckoutToken();
  const applyDiscountCodeChange = useApplyDiscountCodeChange();
  const discountCodes = useDiscountCodes();
  const shop = useShop();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignment, setAssignment] = useState(null);
  const [sendingConversion, setSendingConversion] = useState(false);
  const [impressionTracked, setImpressionTracked] = useState(false);
  const [applyingDiscountCode, setApplyingDiscountCode] = useState(false);
  const [discountCodeApplyError, setDiscountCodeApplyError] = useState('');
  const [autoApplyAttempted, setAutoApplyAttempted] = useState(false);

  const shopDomain = useMemo(() => {
    const configured = normalizeShopDomain(RIPX_CHECKOUT_UI_SHOP_DOMAIN);
    if (configured) {
      return configured;
    }
    return normalizeShopDomain(shop?.myshopifyDomain || shop?.storefrontUrl || '');
  }, [shop]);

  const checkoutId = useMemo(() => {
    const direct = String(checkoutToken || '').trim();
    if (direct) {
      return direct;
    }
    return getAttribute(attributes, '_ripx_checkout_id');
  }, [checkoutToken, attributes]);

  const testId = useMemo(() => {
    const configured = String(RIPX_CHECKOUT_UI_TEST_ID || '').trim();
    if (configured) {
      return configured;
    }
    return getAttribute(attributes, '_ripx_checkout_test');
  }, [attributes]);
  const assignmentVariantFromLines = useMemo(
    () => getAssignmentVariantFromCartLines(cartLines, testId),
    [cartLines, testId]
  );
  const assignmentCheckoutPhase = normalizeCheckoutPhase(
    assignment?.checkout_phase ||
      assignment?.checkoutPhase ||
      assignment?.metadata?.checkout_phase ||
      inferCheckoutPhaseFromConfig(assignment?.config || {})
  );

  const sendCheckoutEvent = useCallback(
    async (eventName, metadata = {}) => {
      if (!RIPX_CHECKOUT_CONVERSION_URL || !shopDomain || !checkoutId || !testId) {
        return;
      }
      try {
        await fetch(RIPX_CHECKOUT_CONVERSION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(RIPX_CHECKOUT_PRICE_SECRET
              ? { 'X-RipX-Price-Secret': RIPX_CHECKOUT_PRICE_SECRET }
              : {}),
          },
          body: JSON.stringify({
            secret: RIPX_CHECKOUT_PRICE_SECRET || undefined,
            shop: shopDomain,
            test_id: testId,
            checkout_id: checkoutId,
            event_name: eventName,
            metadata,
          }),
        });
      } catch (_) {
        // Best-effort tracking only.
      }
    },
    [shopDomain, checkoutId, testId]
  );

  const trackConversion = useCallback(
    async (eventName, metadata = {}) => {
      if (sendingConversion) {
        return;
      }
      setSendingConversion(true);
      try {
        await sendCheckoutEvent(eventName, metadata);
      } finally {
        setSendingConversion(false);
      }
    },
    [sendingConversion, sendCheckoutEvent]
  );

  const sendRuntimeDiagnostic = useCallback(
    (reason, metadata = {}) => {
      void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.diagnostic, {
        diagnostic_reason: reason,
        checkout_phase: metadata.checkout_phase || 'experience',
        ...metadata,
      });
    },
    [sendCheckoutEvent]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadAssignment() {
      if (!RIPX_CHECKOUT_ASSIGNMENT_URL) {
        setLoading(false);
        setError(
          'Assignment URL is not configured. Run npm run shopify:checkout-ui:sync-config and redeploy.'
        );
        return;
      }
      if (!shopDomain || !checkoutId || !testId) {
        setLoading(false);
        setError(
          'Missing checkout context. Ensure shop domain, checkout token, and test id are available.'
        );
        return;
      }
      setLoading(true);
      setError('');
      try {
        const response = await fetch(RIPX_CHECKOUT_ASSIGNMENT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(RIPX_CHECKOUT_PRICE_SECRET
              ? { 'X-RipX-Price-Secret': RIPX_CHECKOUT_PRICE_SECRET }
              : {}),
          },
          body: JSON.stringify({
            secret: RIPX_CHECKOUT_PRICE_SECRET || undefined,
            shop: shopDomain,
            test_id: testId,
            checkout_id: checkoutId,
            assignment_variant: assignmentVariantFromLines || undefined,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || `Assignment request failed (${response.status})`);
        }
        if (cancelled) {
          return;
        }
        const nextAssignment = payload.assignment || null;
        setAssignment(nextAssignment);
        setLoading(false);
        setError('');
        if (!nextAssignment) {
          sendRuntimeDiagnostic('no_assignment', {
            assignment_source: 'none',
          });
        }
      } catch (e) {
        if (cancelled) {
          return;
        }
        setAssignment(null);
        setLoading(false);
        setError(String(e?.message || 'Could not fetch assignment'));
        sendRuntimeDiagnostic('assignment_fetch_failed', {
          error_message: String(e?.message || 'Could not fetch assignment').slice(0, 180),
        });
      }
    }
    void loadAssignment();
    return () => {
      cancelled = true;
    };
  }, [shopDomain, checkoutId, testId, assignmentVariantFromLines, sendRuntimeDiagnostic]);

  useEffect(() => {
    if (!assignment || impressionTracked) {
      return;
    }
    setImpressionTracked(true);
    const phase = assignmentCheckoutPhase;
    const sections =
      assignment?.config && typeof assignment.config === 'object'
        ? getCheckoutSections(assignment.config).filter(section =>
            hasRenderableCheckoutSection(section)
          )
        : [];
    if (phase === 'experience' && sections.length === 0) {
      sendRuntimeDiagnostic('no_renderable_checkout_sections', {
        variant_id: assignment?.variant_id || null,
        checkout_phase: phase,
      });
    }
    void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.impression, {
      variant_id: assignment?.variant_id || null,
      checkout_phase: phase,
    });
    sections.forEach(section => {
      void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.sectionImpression, {
        variant_id: assignment?.variant_id || null,
        checkout_phase: phase,
        checkout_section_id: section.id || null,
        checkout_section_type: section.type || null,
      });
    });
    if (phase === 'payment_method') {
      const methods = parseCheckoutFeatureBullets(assignment?.config?.payment_method_names);
      void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.customizationMatch, {
        variant_id: assignment?.variant_id || null,
        checkout_phase: phase,
        checkout_customization_type: 'payment_method',
        checkout_method_count: methods.length,
      });
      void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.paymentMethodAction, {
        variant_id: assignment?.variant_id || null,
        checkout_phase: phase,
        checkout_method_action: String(assignment?.config?.payment_action || 'hide'),
        checkout_method_count: methods.length,
      });
    }
    if (phase === 'delivery_method') {
      const methods = parseCheckoutFeatureBullets(assignment?.config?.delivery_method_names);
      void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.customizationMatch, {
        variant_id: assignment?.variant_id || null,
        checkout_phase: phase,
        checkout_customization_type: 'delivery_method',
        checkout_method_count: methods.length,
      });
      void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.deliveryMethodAction, {
        variant_id: assignment?.variant_id || null,
        checkout_phase: phase,
        checkout_method_action: String(assignment?.config?.delivery_action || 'hide'),
        checkout_method_count: methods.length,
      });
    }
  }, [
    assignment,
    assignmentCheckoutPhase,
    impressionTracked,
    sendCheckoutEvent,
    sendRuntimeDiagnostic,
  ]);

  const cfg =
    assignment && assignment.config && typeof assignment.config === 'object'
      ? assignment.config
      : {};
  const variantName = String(
    assignment?.variant_name || assignment?.variant_id || 'Assigned'
  ).trim();
  const hasOfferConfig = isActionableOfferConfig(cfg);
  const resolvedOfferCode = resolveOfferCodeFromConfig(
    cfg,
    testId || assignment?.test_id || 'test',
    variantName,
    assignment
  );
  const discountCodeName = resolvedOfferCode.codeName;
  const offerCodeSourceLabel = resolvedOfferCode.sourceLabel;
  const checkoutSections = getCheckoutSections(cfg);
  const primarySection =
    checkoutSections.find(section => hasRenderableCheckoutSection(section)) ||
    checkoutSections[0] ||
    null;
  const checkoutPhase = assignmentCheckoutPhase;
  const activeDiscountCodes = useMemo(() => {
    const rows = Array.isArray(discountCodes)
      ? discountCodes
      : Array.isArray(discountCodes?.value)
        ? discountCodes.value
        : [];
    return rows.map(row => String(row?.code || '').trim()).filter(Boolean);
  }, [discountCodes]);
  const hasDiscountCodeApplied = useMemo(() => {
    const target = String(discountCodeName || '')
      .trim()
      .toLowerCase();
    if (!target) {
      return false;
    }
    return activeDiscountCodes.some(
      code =>
        String(code || '')
          .trim()
          .toLowerCase() === target
    );
  }, [activeDiscountCodes, discountCodeName]);
  const offerCodeStatusLabel = useMemo(() => {
    if (!hasOfferConfig) {
      return '';
    }
    let base = 'Code status: generated';
    if (hasDiscountCodeApplied) {
      base = 'Code status: applied';
    } else if (applyingDiscountCode) {
      base = 'Code status: applying';
    } else if (discountCodeApplyError) {
      base = 'Code status: apply failed';
    } else if (autoApplyAttempted) {
      base = 'Code status: pending confirmation';
    }
    return `${base} | Source: ${offerCodeSourceLabel}`;
  }, [
    applyingDiscountCode,
    autoApplyAttempted,
    discountCodeApplyError,
    hasDiscountCodeApplied,
    hasOfferConfig,
    offerCodeSourceLabel,
  ]);
  const offerCodeStatusLegend =
    'Applied=active, Applying=in progress, Pending=waiting, Failed=rejected, Generated=ready.';
  const applyOfferDiscountCode = useCallback(
    async (force = false) => {
      if (!hasOfferConfig || !discountCodeName) {
        return;
      }
      if (!force && hasDiscountCodeApplied) {
        return;
      }
      if (typeof applyDiscountCodeChange !== 'function') {
        setDiscountCodeApplyError(
          'Checkout API does not allow discount code updates in this context.'
        );
        sendRuntimeDiagnostic('discount_code_api_unavailable', {
          variant_id: assignment?.variant_id || null,
          checkout_phase: checkoutPhase,
          discount_code: discountCodeName,
        });
        return;
      }
      setApplyingDiscountCode(true);
      setDiscountCodeApplyError('');
      try {
        const result = await applyDiscountCodeChange({
          type: 'addDiscountCode',
          code: discountCodeName,
        });
        if (result?.type === 'error') {
          setDiscountCodeApplyError(
            String(result?.message || 'Could not apply discount code at checkout.')
          );
          sendRuntimeDiagnostic('discount_code_apply_failed', {
            variant_id: assignment?.variant_id || null,
            checkout_phase: checkoutPhase,
            discount_code: discountCodeName,
            error_message: String(
              result?.message || 'Could not apply discount code at checkout.'
            ).slice(0, 180),
          });
          return;
        }
        void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.offerApplied, {
          variant_id: assignment?.variant_id || null,
          discount_code: discountCodeName,
          checkout_phase: checkoutPhase,
        });
        if (primarySection) {
          void sendCheckoutEvent(CHECKOUT_EVENT_NAMES.sectionOfferApplied, {
            variant_id: assignment?.variant_id || null,
            discount_code: discountCodeName,
            checkout_phase: checkoutPhase,
            checkout_section_id: primarySection.id || null,
            checkout_section_type: primarySection.type || null,
          });
        }
      } catch (e) {
        setDiscountCodeApplyError(
          String(e?.message || 'Could not apply discount code at checkout.')
        );
      } finally {
        setApplyingDiscountCode(false);
      }
    },
    [
      applyDiscountCodeChange,
      assignment?.variant_id,
      checkoutPhase,
      discountCodeName,
      hasDiscountCodeApplied,
      hasOfferConfig,
      primarySection,
      sendCheckoutEvent,
      sendRuntimeDiagnostic,
    ]
  );

  useEffect(() => {
    setDiscountCodeApplyError('');
    setAutoApplyAttempted(false);
  }, [assignment?.variant_id, discountCodeName, testId]);

  useEffect(() => {
    if (!assignment || !hasOfferConfig || !discountCodeName || hasDiscountCodeApplied) {
      return;
    }
    if (autoApplyAttempted) {
      return;
    }
    setAutoApplyAttempted(true);
    void applyOfferDiscountCode(false);
  }, [
    applyOfferDiscountCode,
    assignment,
    autoApplyAttempted,
    discountCodeName,
    hasDiscountCodeApplied,
    hasOfferConfig,
  ]);

  if (loading) {
    return h(
      's-banner',
      { heading: 'RipX checkout experiment', tone: 'info' },
      h('s-text', null, 'Loading assignment...')
    );
  }
  if (error) {
    return h(
      's-banner',
      { heading: 'RipX checkout test unavailable', tone: 'critical' },
      h('s-text', null, error)
    );
  }
  if (!assignment) {
    return h(
      's-banner',
      { heading: 'No checkout variant assigned', tone: 'info' },
      h(
        's-text',
        null,
        'This block did not receive an active checkout assignment for the current test.'
      )
    );
  }
  return h(
    's-stack',
    { direction: 'block', gap: 'tight' },
    ...(checkoutSections.length > 0 ? checkoutSections : [null]).map((section, sectionIndex) => {
      const props = section?.props || {};
      const title =
        String(props.title || '').trim() ||
        (sectionIndex === 0
          ? hasOfferConfig
            ? `Offer variant: ${variantName}`
            : `RipX Variant: ${variantName}`
          : `Checkout section ${sectionIndex + 1}`);
      const cta = String(props.cta_label || 'Track conversion').trim();
      const layout = normalizeCheckoutLayout(props.layout);
      const tone = normalizeCheckoutTone(props.tone);
      const ctaKind = normalizeCheckoutCtaKind(props.cta_kind);
      const productSourceMode = normalizeCheckoutProductSourceMode(props.product_source_mode);
      const productSourceLimit = normalizeCheckoutProductSourceLimit(props.product_source_limit);
      const productDisplayLayout = normalizeCheckoutProductDisplayLayout(
        props.product_display_layout
      );
      const productSourceCollections = parseCheckoutProductSourceCollections(
        props.product_source_collections
      );
      const productItems =
        productSourceMode === 'cart_related'
          ? getCartRelatedCheckoutProductItems(cartLines, productSourceLimit)
          : parseCheckoutProductItems(props.product_items).filter(hasRenderableCheckoutProductItem);
      const isOfferSection =
        hasOfferConfig &&
        ((section && section.type === 'offer_code_panel') ||
          (primarySection && section?.id === primarySection.id) ||
          (!section && sectionIndex === 0));
      const renderProductItem = (item, productIndex) => {
        const key = item.id || `product-${productIndex}`;
        if (productDisplayLayout === 'comparison_table') {
          return h(
            's-stack',
            { key, direction: 'inline', gap: 'tight' },
            item.badge_text ? h('s-text', { key: 'badge' }, item.badge_text) : null,
            item.title ? h('s-text', { key: 'title' }, item.title) : null,
            item.price || item.compare_at_price
              ? h(
                  's-text',
                  { key: 'price' },
                  [item.price, item.compare_at_price ? `Compare at ${item.compare_at_price}` : null]
                    .filter(Boolean)
                    .join(' / ')
                )
              : null
          );
        }
        return h(
          's-stack',
          {
            key,
            direction: productDisplayLayout === 'compact_rows' ? 'inline' : 'block',
            gap: 'extraTight',
          },
          item.image_url && productDisplayLayout !== 'comparison_table'
            ? h('s-image', {
                key: 'image',
                src: item.image_url,
                alt: item.title || 'Product image',
                aspectRatio: '1/1',
                borderRadius: 'base',
              })
            : null,
          item.badge_text ? h('s-text', { key: 'badge' }, item.badge_text) : null,
          item.title ? h('s-text', { key: 'title' }, item.title) : null,
          item.subtitle && productDisplayLayout !== 'compact_rows'
            ? h('s-text', { key: 'subtitle' }, item.subtitle)
            : null,
          item.price || item.compare_at_price
            ? h(
                's-text',
                { key: 'price' },
                [item.price, item.compare_at_price ? `Compare at ${item.compare_at_price}` : null]
                  .filter(Boolean)
                  .join(' • ')
              )
            : null
        );
      };
      const children = [
        section?.type === 'product_list' && productSourceMode === 'cart_related'
          ? h(
              's-text',
              { key: 'product-source' },
              `Product source: Cart-related (${productItems.length}/${productSourceLimit})`
            )
          : null,
        section?.type === 'product_list' &&
        productSourceMode === 'collection' &&
        productSourceCollections.length > 0
          ? h(
              's-text',
              { key: 'collection-source' },
              `Product source: Collection (${productSourceCollections
                .map(item => item.title || item.handle || item.id)
                .filter(Boolean)
                .slice(0, 2)
                .join(', ')})`
            )
          : null,
        props.badge_text ? h('s-text', { key: 'badge' }, props.badge_text) : null,
        props.message ? h('s-text', { key: 'message' }, props.message) : null,
        ...parseCheckoutFeatureBullets(props.feature_bullets).map((item, bulletIndex) =>
          h('s-text', { key: `bullet-${bulletIndex}` }, `• ${item}`)
        ),
        productItems.length > 0
          ? h(
              's-stack',
              {
                key: 'product-list',
                direction: productDisplayLayout === 'two_column_grid' ? 'inline' : 'block',
                gap: 'tight',
              },
              ...productItems.map(renderProductItem)
            )
          : null,
        props.disclaimer ? h('s-text', { key: 'disclaimer' }, props.disclaimer) : null,
        isOfferSection
          ? h(
              's-text',
              { key: 'discount-code' },
              hasDiscountCodeApplied
                ? `Discount code applied: ${discountCodeName}`
                : `Discount code: ${discountCodeName}`
            )
          : null,
        isOfferSection ? h('s-text', { key: 'status' }, offerCodeStatusLabel) : null,
        isOfferSection ? h('s-text', { key: 'legend' }, offerCodeStatusLegend) : null,
        isOfferSection && !hasDiscountCodeApplied && ctaKind !== 'none'
          ? h(
              's-button',
              {
                key: 'offer-button',
                variant: 'secondary',
                loading: applyingDiscountCode,
                onClick: () => void applyOfferDiscountCode(true),
              },
              ctaKind === 'offer_code' ? cta || 'Apply discount code' : 'Apply discount code'
            )
          : null,
        isOfferSection && discountCodeApplyError
          ? h('s-text', { key: 'error' }, discountCodeApplyError)
          : null,
        sectionIndex === 0 ? h('s-text', { key: 'test-id' }, `Test ID: ${testId}`) : null,
        ctaKind !== 'none' && (!hasOfferConfig || ctaKind === 'track')
          ? h(
              's-button',
              {
                key: 'track-button',
                variant: 'secondary',
                loading: sendingConversion,
                onClick: async () => {
                  const metadata = {
                    variant_id: assignment?.variant_id || null,
                    checkout_phase: checkoutPhase,
                    checkout_section_id: section?.id || null,
                    checkout_section_type: section?.type || null,
                  };
                  await trackConversion(CHECKOUT_EVENT_NAMES.ctaClick, metadata);
                  await sendCheckoutEvent(CHECKOUT_EVENT_NAMES.sectionCtaClick, metadata);
                },
              },
              cta
            )
          : null,
      ].filter(Boolean);

      if (layout === 'compact') {
        return h(
          's-stack',
          { key: section?.id || `section-${sectionIndex}`, direction: 'block', gap: 'tight' },
          h('s-text', null, title),
          ...children
        );
      }

      return h(
        's-banner',
        { key: section?.id || `section-${sectionIndex}`, heading: title, tone },
        ...children
      );
    })
  );
}

export default function extension() {
  const mountTarget = globalThis?.document?.body;
  if (!mountTarget) {
    return;
  }
  render(h(CheckoutExperiment), mountTarget);
}
