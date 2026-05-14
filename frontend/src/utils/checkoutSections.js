export const CHECKOUT_SECTION_TYPES = [
  'hero_notice',
  'trust_box',
  'guarantee_box',
  'shipping_promise',
  'offer_code_panel',
  'product_list',
];

export const CHECKOUT_PLACEMENTS = ['purchase.checkout.block.render'];
export const CHECKOUT_TONES = ['success', 'info', 'warning', 'critical'];
export const CHECKOUT_LAYOUTS = ['banner', 'stacked', 'compact'];
export const CHECKOUT_CTA_KINDS = ['track', 'offer_code', 'none'];
export const CHECKOUT_PRODUCT_SOURCE_MODES = ['manual', 'cart_related', 'collection'];
export const CHECKOUT_PRODUCT_DISPLAY_LAYOUTS = [
  'stacked_cards',
  'compact_rows',
  'two_column_grid',
  'comparison_table',
];
export const CHECKOUT_EXPERIENCE_CONFIG_VERSION = 2;
export const CHECKOUT_PRIMARY_OUTPUT_GOALS = [
  'conversion_lift',
  'average_order_value',
  'product_add_rate',
  'checkout_reassurance',
];
export const CHECKOUT_PRODUCT_ACTIONS = ['display_only', 'add_to_cart'];
export const CHECKOUT_PRODUCT_SELECTION_STRATEGIES = [
  'manual_upsell',
  'cart_companion',
  'collection_ordered',
  'collection_bestseller',
  'reassurance_bundle',
  'display_only',
];

export function normalizeCheckoutPhase(rawValue) {
  const value = String(rawValue || 'experience')
    .trim()
    .toLowerCase();
  return ['experience', 'payment_method', 'delivery_method'].includes(value) ? value : 'experience';
}

export function normalizeCheckoutListInput(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(rawValue || '')
    .split(/\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function getCheckoutListPreview(rawValue) {
  return normalizeCheckoutListInput(rawValue).join(', ');
}

export function normalizeCheckoutSectionType(rawValue) {
  const value = String(rawValue || 'hero_notice')
    .trim()
    .toLowerCase();
  return CHECKOUT_SECTION_TYPES.includes(value) ? value : 'hero_notice';
}

export function normalizeCheckoutPlacement(rawValue) {
  const value = String(rawValue || 'purchase.checkout.block.render')
    .trim()
    .toLowerCase();
  return CHECKOUT_PLACEMENTS.includes(value) ? value : 'purchase.checkout.block.render';
}

export function normalizeCheckoutTone(rawValue) {
  const value = String(rawValue || 'success')
    .trim()
    .toLowerCase();
  return CHECKOUT_TONES.includes(value) ? value : 'success';
}

export function normalizeCheckoutLayout(rawValue) {
  const value = String(rawValue || 'banner')
    .trim()
    .toLowerCase();
  return CHECKOUT_LAYOUTS.includes(value) ? value : 'banner';
}

export function normalizeCheckoutCtaKind(rawValue) {
  const value = String(rawValue || 'track')
    .trim()
    .toLowerCase();
  return CHECKOUT_CTA_KINDS.includes(value) ? value : 'track';
}

export function normalizeCheckoutProductSourceMode(rawValue) {
  const value = String(rawValue || 'manual')
    .trim()
    .toLowerCase();
  return CHECKOUT_PRODUCT_SOURCE_MODES.includes(value) ? value : 'manual';
}

export function normalizeCheckoutProductSourceLimit(rawValue) {
  const numeric = Number.parseInt(String(rawValue ?? '3').trim(), 10);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.min(6, Math.max(1, numeric));
}

export function normalizeCheckoutProductDisplayLayout(rawValue) {
  const value = String(rawValue || 'stacked_cards')
    .trim()
    .toLowerCase();
  return CHECKOUT_PRODUCT_DISPLAY_LAYOUTS.includes(value) ? value : 'stacked_cards';
}

export function normalizeCheckoutPrimaryOutputGoal(rawValue) {
  const value = String(rawValue || 'conversion_lift')
    .trim()
    .toLowerCase();
  return CHECKOUT_PRIMARY_OUTPUT_GOALS.includes(value) ? value : 'conversion_lift';
}

export function normalizeCheckoutProductAction(rawValue) {
  const value = String(rawValue || 'display_only')
    .trim()
    .toLowerCase();
  return CHECKOUT_PRODUCT_ACTIONS.includes(value) ? value : 'display_only';
}

export function normalizeCheckoutProductSelectionStrategy(rawValue) {
  const value = String(rawValue || 'manual_upsell')
    .trim()
    .toLowerCase();
  return CHECKOUT_PRODUCT_SELECTION_STRATEGIES.includes(value) ? value : 'manual_upsell';
}

function normalizeCheckoutAnalyticsKey(rawValue, fallback = '') {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function normalizeCheckoutProductQuantity(rawValue) {
  const numeric = Number.parseInt(String(rawValue ?? '1').trim(), 10);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(10, Math.max(1, numeric));
}

export function normalizeCheckoutProductSourceCollections(rawValue) {
  const rows = Array.isArray(rawValue) ? rawValue : [];
  const parsed = rows
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
    .filter(Boolean);
  const seen = new Set();
  return parsed.filter(entry => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

export function createEmptyCheckoutSection(index = 0, type = 'hero_notice') {
  const normalizedType = normalizeCheckoutSectionType(type);
  return {
    id: `${normalizedType}-${index + 1}`,
    type: normalizedType,
    enabled: true,
    order: index,
    strategy_key: normalizedType === 'product_list' ? 'manual_upsell' : '',
    props: {
      title: '',
      message: '',
      badge_text: '',
      disclaimer: '',
      cta_label: '',
      tone: 'success',
      layout: 'banner',
      cta_kind: 'track',
      feature_bullets: [],
      product_source_mode: 'manual',
      product_source_limit: 3,
      product_display_layout: 'stacked_cards',
      product_source_collections: [],
      product_items: [],
      product_action: normalizedType === 'product_list' ? 'display_only' : '',
      selection_strategy: normalizedType === 'product_list' ? 'manual_upsell' : '',
      exclude_cart_items: true,
      fallback_mode: 'hide_section',
    },
  };
}

export function normalizeCheckoutProductItems(rawValue) {
  const rows = Array.isArray(rawValue) ? rawValue : [];
  return rows
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const source = item;
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
      const productGid = String(
        source.product_gid || source.product_id || source.productGid || ''
      ).trim();
      const variantGid = String(
        source.variant_gid || source.variant_id || source.variantGid || ''
      ).trim();
      const merchandiseId = String(
        source.merchandise_id || source.merchandiseId || variantGid || ''
      ).trim();
      const rank = Number.parseInt(String(source.rank ?? index + 1).trim(), 10);
      const productAction = normalizeCheckoutProductAction(
        source.product_action || source.checkout_product_action
      );
      const selectionStrategy = normalizeCheckoutProductSelectionStrategy(
        source.selection_strategy || source.strategy_key
      );
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
        product_gid: productGid,
        variant_gid: variantGid || merchandiseId,
        merchandise_id: merchandiseId,
        handle: String(source.handle || source.product_handle || '').trim(),
        quantity: normalizeCheckoutProductQuantity(source.quantity),
        rank: Number.isFinite(rank) ? Math.max(1, rank) : index + 1,
        action_label: String(source.action_label || source.cta_label || 'Add').trim(),
        product_action: productAction,
        selection_strategy: selectionStrategy,
        exclude_cart_items: source.exclude_cart_items !== false,
        fallback_mode: String(source.fallback_mode || 'hide_button').trim() || 'hide_button',
        analytics_key: normalizeCheckoutAnalyticsKey(source.analytics_key, `product_${index + 1}`),
      };
    })
    .filter(Boolean);
}

export function hasRenderableCheckoutProductItem(item = {}) {
  return Boolean(
    item.image_url ||
    item.title ||
    item.subtitle ||
    item.price ||
    item.compare_at_price ||
    item.badge_text ||
    item.merchandise_id ||
    item.variant_gid ||
    item.product_gid
  );
}

function normalizeCheckoutSectionId(rawValue, index, type) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `${type}-${index + 1}`;
}

function normalizeCheckoutSectionProps(section = {}) {
  const propsSource =
    section.props && typeof section.props === 'object' ? { ...section, ...section.props } : section;
  return {
    title: String(propsSource.title || propsSource.checkout_title || '').trim(),
    message: String(propsSource.message || propsSource.checkout_message || '').trim(),
    badge_text: String(propsSource.badge_text || propsSource.checkout_badge_text || '').trim(),
    disclaimer: String(propsSource.disclaimer || propsSource.checkout_disclaimer || '').trim(),
    cta_label: String(propsSource.cta_label || propsSource.checkout_cta_label || '').trim(),
    tone: normalizeCheckoutTone(propsSource.tone || propsSource.checkout_tone),
    layout: normalizeCheckoutLayout(propsSource.layout || propsSource.checkout_layout),
    cta_kind: normalizeCheckoutCtaKind(propsSource.cta_kind || propsSource.checkout_cta_kind),
    feature_bullets: normalizeCheckoutListInput(
      propsSource.feature_bullets || propsSource.checkout_feature_bullets
    ),
    product_source_mode: normalizeCheckoutProductSourceMode(
      propsSource.product_source_mode || propsSource.checkout_product_source_mode
    ),
    product_source_limit: normalizeCheckoutProductSourceLimit(
      propsSource.product_source_limit || propsSource.checkout_product_source_limit
    ),
    product_display_layout: normalizeCheckoutProductDisplayLayout(
      propsSource.product_display_layout || propsSource.checkout_product_display_layout
    ),
    product_action: normalizeCheckoutProductAction(
      propsSource.product_action || propsSource.checkout_product_action
    ),
    selection_strategy: normalizeCheckoutProductSelectionStrategy(
      propsSource.selection_strategy ||
        propsSource.strategy_key ||
        propsSource.checkout_product_selection_strategy
    ),
    exclude_cart_items: propsSource.exclude_cart_items !== false,
    fallback_mode: String(propsSource.fallback_mode || 'hide_section').trim() || 'hide_section',
    product_source_collections: normalizeCheckoutProductSourceCollections(
      propsSource.product_source_collections ||
        propsSource.checkout_product_source_collections ||
        propsSource.product_source_collection_ids
    ),
    product_items: normalizeCheckoutProductItems(
      propsSource.product_items || propsSource.checkout_product_items
    ),
  };
}

export function normalizeCheckoutSection(section = {}, index = 0) {
  const type = normalizeCheckoutSectionType(section.type);
  return {
    id: normalizeCheckoutSectionId(section.id, index, type),
    type,
    enabled: section.enabled !== false,
    order: Number.isInteger(section.order) ? section.order : index,
    strategy_key:
      type === 'product_list'
        ? normalizeCheckoutProductSelectionStrategy(
            section.strategy_key || section.props?.strategy_key || section.props?.selection_strategy
          )
        : '',
    props: normalizeCheckoutSectionProps(section),
  };
}

export function hasRenderableCheckoutSection(section = {}) {
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
    normalizeCheckoutListInput(props.feature_bullets).length > 0 ||
    props.product_source_mode === 'cart_related' ||
    (props.product_source_mode === 'collection' &&
      normalizeCheckoutProductSourceCollections(props.product_source_collections).length > 0) ||
    normalizeCheckoutProductItems(props.product_items).some(hasRenderableCheckoutProductItem)
  );
}

function buildLegacyCheckoutSections(config = {}) {
  const legacySection = normalizeCheckoutSection(
    {
      id: 'hero-notice-1',
      type: 'hero_notice',
      enabled: true,
      order: 0,
      props: config,
    },
    0
  );
  return hasRenderableCheckoutSection(legacySection) ? [legacySection] : [];
}

export function getNormalizedCheckoutExperienceConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const explicitSections = Array.isArray(source.checkout_sections)
    ? source.checkout_sections.map((section, index) => normalizeCheckoutSection(section, index))
    : [];
  return {
    checkout_config_version: CHECKOUT_EXPERIENCE_CONFIG_VERSION,
    primary_output_goal: normalizeCheckoutPrimaryOutputGoal(
      source.primary_output_goal || source.checkout_primary_output_goal
    ),
    variant_hypothesis: String(
      source.variant_hypothesis || source.checkout_variant_hypothesis || ''
    )
      .trim()
      .slice(0, 240),
    analytics_key: normalizeCheckoutAnalyticsKey(
      source.analytics_key || source.checkout_analytics_key
    ),
    checkout_placement: normalizeCheckoutPlacement(
      source.checkout_placement || source.checkoutPlacement
    ),
    checkout_sections:
      explicitSections.length > 0
        ? explicitSections.sort((left, right) => left.order - right.order)
        : buildLegacyCheckoutSections(source),
  };
}

export function getActionableCheckoutSections(config = {}) {
  return getNormalizedCheckoutExperienceConfig(config).checkout_sections.filter(section =>
    hasRenderableCheckoutSection(section)
  );
}

export function getPrimaryCheckoutSection(config = {}) {
  const normalized = getNormalizedCheckoutExperienceConfig(config);
  return (
    normalized.checkout_sections.find(section => hasRenderableCheckoutSection(section)) || null
  );
}

export function syncLegacyCheckoutExperienceFields(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const normalized = getNormalizedCheckoutExperienceConfig(source);
  const primarySection =
    normalized.checkout_sections.find(section => hasRenderableCheckoutSection(section)) ||
    normalized.checkout_sections[0] ||
    createEmptyCheckoutSection(0);
  const props = primarySection?.props || {};
  return {
    ...source,
    checkout_placement: normalized.checkout_placement,
    checkout_sections: normalized.checkout_sections,
    checkout_title: props.title || '',
    checkout_message: props.message || '',
    checkout_badge_text: props.badge_text || '',
    checkout_disclaimer: props.disclaimer || '',
    checkout_cta_label: props.cta_label || '',
    checkout_tone: props.tone || 'success',
    checkout_layout: props.layout || 'banner',
    checkout_cta_kind: props.cta_kind || 'track',
    checkout_product_display_layout: props.product_display_layout || 'stacked_cards',
    checkout_product_action: props.product_action || 'display_only',
    checkout_product_selection_strategy:
      props.selection_strategy || primarySection.strategy_key || '',
    checkout_feature_bullets: normalizeCheckoutListInput(props.feature_bullets),
  };
}
