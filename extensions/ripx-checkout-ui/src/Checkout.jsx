import { Banner, BlockStack, Button, Text, extension } from '@shopify/ui-extensions/checkout';
import {
  RIPX_CHECKOUT_ASSIGNMENT_URL,
  RIPX_CHECKOUT_CONVERSION_URL,
  RIPX_CHECKOUT_PRICE_SECRET,
  RIPX_CHECKOUT_UI_SHOP_DOMAIN,
  RIPX_CHECKOUT_UI_TEST_ID,
} from './ripxConfig';

const TARGET = 'purchase.checkout.block.render';

function readCurrent(value) {
  if (value && typeof value === 'object' && 'current' in value) {
    return value.current;
  }
  return value;
}

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

function getCheckoutAttribute(api, key) {
  const attrs = readCurrent(api?.attributes);
  if (!Array.isArray(attrs)) {
    return '';
  }
  const hit = attrs.find(row => String(row?.key || '').trim() === key);
  return String(hit?.value || '').trim();
}

function getCheckoutId(api) {
  const candidates = [
    readCurrent(api?.checkoutToken),
    readCurrent(api?.token),
    readCurrent(api?.checkout?.token),
    getCheckoutAttribute(api, '_ripx_checkout_id'),
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function getShopDomain(api) {
  const configured = normalizeShopDomain(RIPX_CHECKOUT_UI_SHOP_DOMAIN);
  if (configured) {
    return configured;
  }
  const candidates = [
    readCurrent(api?.shop?.myshopifyDomain),
    readCurrent(api?.shop?.storeDomain),
    readCurrent(api?.shop?.storefrontUrl),
    readCurrent(api?.shop),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeShopDomain(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function getTestId(api) {
  const configured = String(RIPX_CHECKOUT_UI_TEST_ID || '').trim();
  if (configured) {
    return configured;
  }
  return getCheckoutAttribute(api, '_ripx_checkout_test');
}

export default extension(TARGET, (root, api) => {
  const state = {
    loading: true,
    error: '',
    assignment: null,
    shopDomain: '',
    checkoutId: '',
    testId: '',
    sendingConversion: false,
    impressionTracked: false,
  };

  const wrapper = root.createComponent(BlockStack, { spacing: 'tight' });
  root.appendChild(wrapper);

  function setChildren(parent, children) {
    if (typeof parent.replaceChildren === 'function') {
      parent.replaceChildren(...children);
      return;
    }
    if (Array.isArray(parent.children)) {
      while (parent.children.length) {
        parent.removeChild(parent.children[0]);
      }
    }
    children.forEach(child => parent.appendChild(child));
  }

  function render() {
    if (state.loading) {
      setChildren(wrapper, [
        root.createComponent(Banner, { status: 'info' }, [
          root.createComponent(Text, {}, 'RipX checkout experiment is loading.'),
        ]),
      ]);
      return;
    }

    if (state.error) {
      setChildren(wrapper, [
        root.createComponent(
          Banner,
          { status: 'critical', title: 'RipX checkout test unavailable' },
          [root.createComponent(Text, {}, state.error)]
        ),
      ]);
      return;
    }

    if (!state.assignment) {
      setChildren(wrapper, [
        root.createComponent(Banner, { status: 'info', title: 'No checkout variant assigned' }, [
          root.createComponent(
            Text,
            {},
            'This block did not receive an active checkout assignment for the current test.'
          ),
        ]),
      ]);
      return;
    }

    const cfg =
      state.assignment.config && typeof state.assignment.config === 'object'
        ? state.assignment.config
        : {};
    const title = String(cfg.checkout_title || cfg.title || '').trim();
    const message = String(cfg.checkout_message || cfg.message || '').trim();
    const cta = String(cfg.checkout_cta_label || cfg.cta_label || 'Track conversion').trim();
    const variantName = String(
      state.assignment.variant_name || state.assignment.variant_id || 'Assigned'
    );

    const bodyChildren = [];
    bodyChildren.push(root.createComponent(Text, {}, title || `RipX Variant: ${variantName}`));
    if (message) {
      bodyChildren.push(root.createComponent(Text, {}, message));
    }
    bodyChildren.push(root.createComponent(Text, {}, `Test ID: ${state.testId}`));
    bodyChildren.push(
      root.createComponent(
        Button,
        {
          kind: 'secondary',
          loading: state.sendingConversion,
          onPress: () => {
            void trackConversion('checkout_extension_cta_click', {
              variant_id: state.assignment?.variant_id || null,
            });
          },
        },
        cta
      )
    );

    setChildren(wrapper, [root.createComponent(Banner, { status: 'success' }, bodyChildren)]);
  }

  async function trackConversion(eventName, metadata = {}) {
    if (state.sendingConversion || !RIPX_CHECKOUT_CONVERSION_URL) {
      return;
    }
    state.sendingConversion = true;
    render();
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
          shop: state.shopDomain,
          test_id: state.testId,
          checkout_id: state.checkoutId,
          event_name: eventName,
          metadata,
        }),
      });
    } catch (_) {
      // Best-effort tracking only.
    } finally {
      state.sendingConversion = false;
      render();
    }
  }

  async function initialize() {
    state.shopDomain = getShopDomain(api);
    state.checkoutId = getCheckoutId(api);
    state.testId = getTestId(api);

    if (!RIPX_CHECKOUT_ASSIGNMENT_URL) {
      state.loading = false;
      state.error =
        'Assignment URL is not configured. Run npm run shopify:checkout-ui:sync-config and redeploy.';
      render();
      return;
    }
    if (!state.shopDomain || !state.checkoutId || !state.testId) {
      state.loading = false;
      state.error =
        'Missing checkout context. Ensure shop domain, checkout token, and test id are available.';
      render();
      return;
    }

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
          shop: state.shopDomain,
          test_id: state.testId,
          checkout_id: state.checkoutId,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `Assignment request failed (${response.status})`);
      }
      state.assignment = payload.assignment || null;
      state.loading = false;
      state.error = '';
      render();
      if (state.assignment && !state.impressionTracked) {
        state.impressionTracked = true;
        void trackConversion('checkout_extension_impression', {
          variant_id: state.assignment?.variant_id || null,
        });
      }
    } catch (error) {
      state.loading = false;
      state.assignment = null;
      state.error = String(error?.message || 'Could not fetch assignment');
      render();
    }
  }

  render();
  void initialize();
});
