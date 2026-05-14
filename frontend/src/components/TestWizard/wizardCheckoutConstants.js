import {
  normalizeCheckoutPhase,
  hasRenderableCheckoutProductItem as hasRenderableCheckoutProductItemCanonical,
  normalizeCheckoutProductItems as normalizeCheckoutProductItemsCanonical,
  normalizeCheckoutProductSourceCollections,
} from '../../utils/checkoutSections';

/** URL pattern for homepage on Shopify: root and /index */
export const HOMEPAGE_URL_PATTERN_SHOPIFY = '^/$|^/index';
/** URL pattern for standalone sites: root, /index, /index.html, /index.php, /default.html (reliable across hosts) */
export const HOMEPAGE_URL_PATTERN_STANDALONE = '^/$|^/index(\\.html|\\.php)?$|^/default\\.html$';

export const PRICE_PRODUCT_MODAL_REVEAL_BATCH = 10;
export const MATRIX_SEARCH_BADGE_MAX_CHARS = 26;

export const CHECKOUT_PHASE_OPTIONS = [
  { label: 'Experience block', value: 'experience' },
  { label: 'Payment methods', value: 'payment_method' },
  { label: 'Delivery methods', value: 'delivery_method' },
];

export const CHECKOUT_LAYOUT_OPTIONS = [
  { label: 'Banner', value: 'banner' },
  { label: 'Stacked', value: 'stacked' },
  { label: 'Compact', value: 'compact' },
];

export const CHECKOUT_TONE_OPTIONS = [
  { label: 'Success', value: 'success' },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
];

export const CHECKOUT_CTA_KIND_OPTIONS = [
  { label: 'Track CTA', value: 'track' },
  { label: 'Offer code button', value: 'offer_code' },
  { label: 'No CTA', value: 'none' },
];

export const CHECKOUT_PRODUCT_SOURCE_OPTIONS = [
  { label: 'Manual cards', value: 'manual' },
  { label: 'Cart-related', value: 'cart_related' },
  { label: 'Collection-fed', value: 'collection' },
];

export const CHECKOUT_PRODUCT_SOURCE_LIMIT_OPTIONS = [
  { label: '1 card', value: '1' },
  { label: '2 cards', value: '2' },
  { label: '3 cards', value: '3' },
  { label: '4 cards', value: '4' },
  { label: '5 cards', value: '5' },
  { label: '6 cards', value: '6' },
];

export const CHECKOUT_PRODUCT_DISPLAY_LAYOUT_OPTIONS = [
  { label: 'Stacked cards', value: 'stacked_cards' },
  { label: 'Compact rows', value: 'compact_rows' },
  { label: 'Two-column grid', value: 'two_column_grid' },
  { label: 'Comparison table', value: 'comparison_table' },
];

export const CHECKOUT_PRODUCT_ACTION_OPTIONS = [
  { label: 'Display only', value: 'display_only' },
  { label: 'Add product to checkout', value: 'add_to_cart' },
];

export const CHECKOUT_PRODUCT_STRATEGY_OPTIONS = [
  { label: 'Manual upsell', value: 'manual_upsell' },
  { label: 'Cart companion', value: 'cart_companion' },
  { label: 'Collection order', value: 'collection_ordered' },
  { label: 'Reassurance bundle', value: 'reassurance_bundle' },
  { label: 'Display only', value: 'display_only' },
];

export const CHECKOUT_PRIMARY_OUTPUT_GOAL_OPTIONS = [
  { label: 'Conversion lift', value: 'conversion_lift' },
  { label: 'Average order value', value: 'average_order_value' },
  { label: 'Product add rate', value: 'product_add_rate' },
  { label: 'Checkout reassurance', value: 'checkout_reassurance' },
];

export const CHECKOUT_SECTION_TYPE_OPTIONS = [
  { label: 'Hero notice', value: 'hero_notice' },
  { label: 'Trust box', value: 'trust_box' },
  { label: 'Guarantee box', value: 'guarantee_box' },
  { label: 'Shipping promise', value: 'shipping_promise' },
  { label: 'Offer code panel', value: 'offer_code_panel' },
  { label: 'Product list', value: 'product_list' },
];

export const CHECKOUT_SECTION_STARTER_GROUPS = [
  {
    label: 'Recommended patterns',
    description: 'Fastest starting points for most checkout experience tests.',
    starterTypes: ['hero_notice', 'trust_box', 'product_list'],
  },
  {
    label: 'Confidence and policy',
    description: 'Reduce checkout hesitation with trust, guarantees, and delivery clarity.',
    starterTypes: ['guarantee_box', 'shipping_promise'],
  },
  {
    label: 'Offer and incentive',
    description: 'Surface checkout-specific promo framing and offer apply behavior.',
    starterTypes: ['offer_code_panel'],
  },
];

export const CHECKOUT_PLACEMENT_OPTIONS = [
  { label: 'Checkout block', value: 'purchase.checkout.block.render' },
];

export const CHECKOUT_PHASE_DETAILS = Object.freeze({
  experience: {
    eyebrow: 'Checkout UI extension',
    title: 'Experience block',
    description:
      'Render reassurance, urgency, guarantees, and offer content directly inside the checkout block extension.',
    surface: 'Fixed to checkout content rendering',
  },
  payment_method: {
    eyebrow: 'Shopify customization',
    title: 'Payment methods',
    description: 'Experiment with hiding, renaming, or reordering payment options during checkout.',
    surface:
      'Customization targets payment methods; checkout block content still follows extension placement',
  },
  delivery_method: {
    eyebrow: 'Shopify customization',
    title: 'Delivery methods',
    description:
      'Experiment with hiding, renaming, or reordering delivery methods during checkout.',
    surface:
      'Customization targets delivery methods; checkout block content still follows extension placement',
  },
});

export const CHECKOUT_SECTION_DETAILS = Object.freeze({
  hero_notice: {
    label: 'Hero notice',
    description: 'Primary reassurance or urgency message',
  },
  trust_box: {
    label: 'Trust box',
    description: 'Trust badges, benefits, and proof points',
  },
  guarantee_box: {
    label: 'Guarantee box',
    description: 'Guarantees, refund promises, and policy confidence',
  },
  shipping_promise: {
    label: 'Shipping promise',
    description: 'Shipping expectation or arrival messaging',
  },
  offer_code_panel: {
    label: 'Offer code panel',
    description: 'Promo or offer messaging with CTA support',
  },
  product_list: {
    label: 'Product list',
    description: 'Manual, cart-related, or collection-fed merchandising for checkout',
  },
});

export function getCheckoutPhaseLabel(rawValue) {
  const phase = normalizeCheckoutPhase(rawValue);
  return CHECKOUT_PHASE_OPTIONS.find(option => option.value === phase)?.label || 'Experience block';
}

export function getCheckoutPhaseDetails(rawValue) {
  const phase = normalizeCheckoutPhase(rawValue);
  return CHECKOUT_PHASE_DETAILS[phase] || CHECKOUT_PHASE_DETAILS.experience;
}

export function getCheckoutSectionDetails(rawValue) {
  const type = String(rawValue || 'hero_notice')
    .trim()
    .toLowerCase();
  return CHECKOUT_SECTION_DETAILS[type] || CHECKOUT_SECTION_DETAILS.hero_notice;
}

export function buildCheckoutSectionSmartPreset(rawType) {
  const type = String(rawType || 'hero_notice')
    .trim()
    .toLowerCase();
  switch (type) {
    case 'trust_box':
      return {
        title: 'Why customers complete checkout',
        message:
          'Reinforce trust with fast support, secure payment handling, and clear order protection.',
        badge_text: 'Trusted by shoppers',
        disclaimer: 'Support and policy details stay available after purchase.',
        cta_label: 'Continue securely',
        tone: 'info',
        layout: 'stacked',
        cta_kind: 'track',
        feature_bullets: ['Secure payment flow', 'Fast support response', 'Transparent policies'],
      };
    case 'guarantee_box':
      return {
        title: 'Protected purchase guarantee',
        message:
          'Reduce hesitation with a direct reminder of your return, refund, or satisfaction promise.',
        badge_text: 'Risk-free',
        disclaimer: 'Terms apply based on your store policy.',
        cta_label: 'Review guarantee',
        tone: 'success',
        layout: 'banner',
        cta_kind: 'track',
        feature_bullets: [
          'Money-back coverage',
          'Simple returns',
          'Support if anything goes wrong',
        ],
      };
    case 'shipping_promise':
      return {
        title: 'Shipping promise',
        message: 'Set clear delivery expectations before the customer places the order.',
        badge_text: 'Fast dispatch',
        disclaimer: 'Delivery timing depends on carrier and destination.',
        cta_label: 'View delivery info',
        tone: 'info',
        layout: 'compact',
        cta_kind: 'track',
        feature_bullets: ['Quick fulfillment', 'Tracking updates', 'Clear delivery expectations'],
      };
    case 'offer_code_panel':
      return {
        title: 'Complete checkout with your offer',
        message:
          'Surface the active offer at the final step so the shopper does not second-guess the value.',
        badge_text: 'Checkout incentive',
        disclaimer: 'Offer availability follows your test and store rules.',
        cta_label: 'Apply offer',
        tone: 'warning',
        layout: 'banner',
        cta_kind: 'offer_code',
        feature_bullets: [
          'Offer shown at the final step',
          'One-click CTA tracking',
          'Strong conversion reminder',
        ],
      };
    case 'product_list':
      return {
        title: 'Complete your order with these picks',
        message: 'Merchandise manual cards or auto-pull cart-related products inside checkout.',
        badge_text: 'Recommended',
        disclaimer: 'Product availability and pricing should match your live store configuration.',
        cta_label: 'Review picks',
        tone: 'info',
        layout: 'stacked',
        cta_kind: 'track',
        product_display_layout: 'stacked_cards',
        product_action: 'display_only',
        selection_strategy: 'manual_upsell',
        exclude_cart_items: true,
        fallback_mode: 'hide_section',
        feature_bullets: [
          'Manual checkout merchandising',
          'Cart-aware product highlights',
          'Collection-fed product picks',
        ],
        product_source_mode: 'manual',
        product_source_limit: 3,
        product_source_collections: [],
        product_items: [
          {
            id: 'product-1',
            image_url: '',
            title: 'Premium add-on',
            subtitle: 'High-intent upsell for checkout',
            price: '$29',
            compare_at_price: '$39',
            badge_text: 'Best seller',
            quantity: 1,
            action_label: 'Add',
            product_action: 'display_only',
            selection_strategy: 'manual_upsell',
          },
          {
            id: 'product-2',
            image_url: '',
            title: 'Protection plan',
            subtitle: 'Low-friction checkout companion',
            price: '$9',
            compare_at_price: '',
            badge_text: 'Popular',
            quantity: 1,
            action_label: 'Add',
            product_action: 'display_only',
            selection_strategy: 'manual_upsell',
          },
        ],
      };
    case 'hero_notice':
    default:
      return {
        title: 'Checkout with confidence',
        message: 'Use a clear reassurance statement to reduce friction right before purchase.',
        badge_text: 'Secure checkout',
        disclaimer: 'Optional note for guarantees, timing, or policy details.',
        cta_label: 'Continue securely',
        tone: 'success',
        layout: 'banner',
        cta_kind: 'track',
        feature_bullets: ['Secure payment', 'Fast support', 'Clear next step'],
      };
  }
}

export function normalizeCheckoutProductItems(rawValue) {
  return normalizeCheckoutProductItemsCanonical(rawValue);
}

export function hasRenderableCheckoutProductItem(item = {}) {
  return hasRenderableCheckoutProductItemCanonical(item);
}

export function createEmptyCheckoutProductItem(index = 0) {
  return {
    id: `product-${index + 1}`,
    image_url: '',
    title: '',
    subtitle: '',
    price: '',
    compare_at_price: '',
    badge_text: '',
    product_gid: '',
    variant_gid: '',
    merchandise_id: '',
    handle: '',
    quantity: 1,
    rank: index + 1,
    action_label: 'Add',
    product_action: 'display_only',
    selection_strategy: 'manual_upsell',
    exclude_cart_items: true,
    fallback_mode: 'hide_button',
    analytics_key: `product_${index + 1}`,
  };
}

export function buildCheckoutCartRelatedPreviewItems(limit = 3) {
  return Array.from({ length: Math.max(1, Number(limit) || 1) }, (_, index) => ({
    id: `cart-related-preview-${index + 1}`,
    image_url: '',
    title: index === 0 ? 'Cart product highlight' : `Cart companion ${index + 1}`,
    subtitle:
      index === 0
        ? 'Auto-filled from the shopper checkout cart'
        : 'Shown dynamically from current cart lines',
    price: index === 0 ? 'Runtime price' : '',
    compare_at_price: '',
    badge_text: index === 0 ? 'Cart-related' : 'Auto',
    product_action: 'display_only',
    selection_strategy: 'cart_companion',
  }));
}

export function buildCheckoutCollectionPreviewItems(collections = [], limit = 3) {
  const selectedCollections = normalizeCheckoutProductSourceCollections(collections);
  const count = Math.max(1, Number(limit) || 1);
  return Array.from({ length: count }, (_, index) => {
    const sourceCollection =
      selectedCollections[index % Math.max(1, selectedCollections.length)] ||
      selectedCollections[0] ||
      null;
    const collectionLabel =
      sourceCollection?.title || sourceCollection?.handle || `Collection ${index + 1}`;
    return {
      id: `collection-preview-${index + 1}`,
      image_url: '',
      title: index === 0 ? `${collectionLabel} pick` : `Featured from ${collectionLabel}`,
      subtitle: 'Auto-filled from selected Shopify collection products',
      price: 'Runtime price',
      compare_at_price: '',
      badge_text: collectionLabel,
      product_action: 'add_to_cart',
      selection_strategy: 'collection_ordered',
      action_label: 'Add',
    };
  });
}

export function buildProgressiveListWindow(items, visibleCount, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const batchSize = Math.max(1, Number(options.batchSize) || PRICE_PRODUCT_MODAL_REVEAL_BATCH);
  const getId = typeof options.getId === 'function' ? options.getId : item => item?.id;
  const pinnedIds = Array.isArray(options.pinnedIds) ? options.pinnedIds : [];
  const normalizedVisibleCount = Math.max(0, Number(visibleCount) || 0);

  const baseVisible = list.slice(0, normalizedVisibleCount);
  const baseIds = new Set(baseVisible.map(item => String(getId(item) || '')));
  const pinnedIdSet = new Set(pinnedIds.filter(Boolean).map(id => String(id)));
  const pinnedExtras = pinnedIdSet.size
    ? list.filter(item => {
        const id = String(getId(item) || '');
        return id && pinnedIdSet.has(id) && !baseIds.has(id);
      })
    : [];

  const visibleItems = [...baseVisible, ...pinnedExtras];
  const shownCount = visibleItems.length;
  const hasHiddenLoaded = shownCount < list.length;
  const canCollapse = shownCount > batchSize;
  const nextRevealCount = Math.min(batchSize, Math.max(list.length - shownCount, 0));

  return {
    visibleItems,
    shownCount,
    hasHiddenLoaded,
    canCollapse,
    nextRevealCount,
    totalLoaded: list.length,
  };
}
