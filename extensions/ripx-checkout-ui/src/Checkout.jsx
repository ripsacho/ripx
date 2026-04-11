import '@shopify/ui-extensions/preact';
import { h, render } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  useApplyDiscountCodeChange,
  useAttributes,
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
} from './ripxConfig';

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
  const discountType = String(config.discount_type || '')
    .trim()
    .toLowerCase();
  if (discountType === 'free_shipping') {
    return 'SHIP';
  }
  const rawValue = config.discount_value;
  const numericValue =
    rawValue !== null && rawValue !== undefined && rawValue !== '' ? Number(rawValue) : NaN;
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

function normalizeOfferDiscountType(config = {}) {
  return String(config.discount_type || config.discountType || '')
    .trim()
    .toLowerCase();
}

function parseOfferDiscountValue(config = {}) {
  const raw = config.discount_value !== undefined ? config.discount_value : config.discountValue;
  const n = raw !== null && raw !== undefined && String(raw).trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

function isActionableOfferConfig(config = {}) {
  const discountType = normalizeOfferDiscountType(config);
  if (discountType === 'free_shipping') {
    return true;
  }
  if (discountType !== 'percent' && discountType !== 'fixed') {
    return false;
  }
  const value = parseOfferDiscountValue(config);
  return Number.isFinite(value) && value > 0;
}

function CheckoutExperiment() {
  const attributes = useAttributes() || [];
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

  const trackConversion = useCallback(
    async (eventName, metadata = {}) => {
      if (
        sendingConversion ||
        !RIPX_CHECKOUT_CONVERSION_URL ||
        !shopDomain ||
        !checkoutId ||
        !testId
      ) {
        return;
      }
      setSendingConversion(true);
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
      } finally {
        setSendingConversion(false);
      }
    },
    [sendingConversion, shopDomain, checkoutId, testId]
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
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || `Assignment request failed (${response.status})`);
        }
        if (cancelled) {
          return;
        }
        setAssignment(payload.assignment || null);
        setLoading(false);
        setError('');
      } catch (e) {
        if (cancelled) {
          return;
        }
        setAssignment(null);
        setLoading(false);
        setError(String(e?.message || 'Could not fetch assignment'));
      }
    }
    void loadAssignment();
    return () => {
      cancelled = true;
    };
  }, [shopDomain, checkoutId, testId]);

  useEffect(() => {
    if (!assignment || impressionTracked) {
      return;
    }
    setImpressionTracked(true);
    void trackConversion('checkout_extension_impression', {
      variant_id: assignment?.variant_id || null,
    });
  }, [assignment, impressionTracked, trackConversion]);

  const cfg =
    assignment && assignment.config && typeof assignment.config === 'object'
      ? assignment.config
      : {};
  const variantName = String(
    assignment?.variant_name || assignment?.variant_id || 'Assigned'
  ).trim();
  const hasOfferConfig = isActionableOfferConfig(cfg);
  const discountCodeName =
    String(cfg.discount_code_name || cfg.discountCodeName || '').trim() ||
    buildAutoOfferCodeName(testId || assignment?.test_id || 'test', variantName, cfg);
  const title =
    String(cfg.checkout_title || cfg.title || '').trim() ||
    (hasOfferConfig ? `Offer variant: ${variantName}` : `RipX Variant: ${variantName}`);
  const message = String(cfg.checkout_message || cfg.message || '').trim();
  const cta = String(cfg.checkout_cta_label || cfg.cta_label || 'Track conversion').trim();
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
    if (hasDiscountCodeApplied) {
      return 'Code status: applied';
    }
    if (applyingDiscountCode) {
      return 'Code status: applying';
    }
    if (discountCodeApplyError) {
      return 'Code status: apply failed';
    }
    if (autoApplyAttempted) {
      return 'Code status: pending confirmation';
    }
    return 'Code status: generated';
  }, [
    applyingDiscountCode,
    autoApplyAttempted,
    discountCodeApplyError,
    hasDiscountCodeApplied,
    hasOfferConfig,
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
          return;
        }
        void trackConversion('checkout_extension_discount_code_applied', {
          variant_id: assignment?.variant_id || null,
          discount_code: discountCodeName,
        });
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
      discountCodeName,
      hasDiscountCodeApplied,
      hasOfferConfig,
      trackConversion,
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
    h(
      's-banner',
      { heading: title, tone: 'success' },
      message ? h('s-text', null, message) : null,
      hasOfferConfig
        ? h(
            's-text',
            null,
            hasDiscountCodeApplied
              ? `Discount code applied: ${discountCodeName}`
              : `Discount code: ${discountCodeName}`
          )
        : null,
      hasOfferConfig ? h('s-text', null, offerCodeStatusLabel) : null,
      hasOfferConfig ? h('s-text', null, offerCodeStatusLegend) : null,
      hasOfferConfig && !hasDiscountCodeApplied
        ? h(
            's-button',
            {
              variant: 'secondary',
              loading: applyingDiscountCode,
              onClick: () => void applyOfferDiscountCode(true),
            },
            'Apply discount code'
          )
        : null,
      discountCodeApplyError ? h('s-text', null, discountCodeApplyError) : null,
      h('s-text', null, `Test ID: ${testId}`),
      h(
        's-button',
        {
          variant: 'secondary',
          loading: sendingConversion,
          onClick: () =>
            void trackConversion('checkout_extension_cta_click', {
              variant_id: assignment?.variant_id || null,
            }),
        },
        cta
      )
    )
  );
}

export default function extension() {
  const mountTarget = globalThis?.document?.body;
  if (!mountTarget) {
    return;
  }
  render(h(CheckoutExperiment), mountTarget);
}
