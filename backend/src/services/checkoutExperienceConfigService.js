const SUPPORTED_CHECKOUT_SECTION_TYPES = Object.freeze([
  'hero_notice',
  'trust_box',
  'guarantee_box',
  'shipping_promise',
  'offer_code_panel',
  'product_list',
]);

const SUPPORTED_CHECKOUT_PLACEMENTS = Object.freeze(['purchase.checkout.block.render']);
const SUPPORTED_CHECKOUT_TONES = Object.freeze(['success', 'info', 'warning', 'critical']);
const SUPPORTED_CHECKOUT_LAYOUTS = Object.freeze(['banner', 'stacked', 'compact']);
const SUPPORTED_CHECKOUT_CTA_KINDS = Object.freeze(['track', 'offer_code', 'none']);
const SUPPORTED_CHECKOUT_PRODUCT_SOURCE_MODES = Object.freeze([
  'manual',
  'cart_related',
  'collection',
]);
const SUPPORTED_CHECKOUT_PRODUCT_DISPLAY_LAYOUTS = Object.freeze([
  'stacked_cards',
  'compact_rows',
  'two_column_grid',
  'comparison_table',
]);
const MAX_CHECKOUT_SECTIONS = 8;

function normalizeCheckoutPhase(rawPhase) {
  const phase = String(rawPhase || 'experience')
    .trim()
    .toLowerCase();
  return ['experience', 'payment_method', 'delivery_method'].includes(phase) ? phase : 'experience';
}

function isCheckoutExperienceTestPayload(payload = {}) {
  const type = String(payload?.type || '')
    .trim()
    .toLowerCase();
  if (type !== 'checkout') {
    return false;
  }
  return normalizeCheckoutPhase(payload?.goal?.checkout_phase) === 'experience';
}

function normalizeCheckoutPlacement(rawPlacement) {
  const placement = String(rawPlacement || 'purchase.checkout.block.render')
    .trim()
    .toLowerCase();
  return SUPPORTED_CHECKOUT_PLACEMENTS.includes(placement)
    ? placement
    : 'purchase.checkout.block.render';
}

function normalizeCheckoutSectionType(rawType) {
  const type = String(rawType || 'hero_notice')
    .trim()
    .toLowerCase();
  return SUPPORTED_CHECKOUT_SECTION_TYPES.includes(type) ? type : 'hero_notice';
}

function normalizeCheckoutTone(rawTone) {
  const tone = String(rawTone || 'success')
    .trim()
    .toLowerCase();
  return SUPPORTED_CHECKOUT_TONES.includes(tone) ? tone : 'success';
}

function normalizeCheckoutLayout(rawLayout) {
  const layout = String(rawLayout || 'banner')
    .trim()
    .toLowerCase();
  return SUPPORTED_CHECKOUT_LAYOUTS.includes(layout) ? layout : 'banner';
}

function normalizeCheckoutCtaKind(rawKind) {
  const kind = String(rawKind || 'track')
    .trim()
    .toLowerCase();
  return SUPPORTED_CHECKOUT_CTA_KINDS.includes(kind) ? kind : 'track';
}

function normalizeCheckoutProductSourceMode(rawMode) {
  const mode = String(rawMode || 'manual')
    .trim()
    .toLowerCase();
  return SUPPORTED_CHECKOUT_PRODUCT_SOURCE_MODES.includes(mode) ? mode : 'manual';
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
  return SUPPORTED_CHECKOUT_PRODUCT_DISPLAY_LAYOUTS.includes(layout) ? layout : 'stacked_cards';
}

function normalizeProductSourceCollections(rawValue) {
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

function normalizeFeatureBullets(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(rawValue || '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeProductItems(rawValue) {
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

function hasRenderableProductItem(item = {}) {
  return Boolean(
    item.image_url ||
    item.title ||
    item.subtitle ||
    item.price ||
    item.compare_at_price ||
    item.badge_text
  );
}

function toSectionId(rawId, index, type) {
  const normalized = String(rawId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `${type}-${index + 1}`;
}

function normalizeSectionProps(rawSection = {}) {
  const propsSource =
    rawSection.props && typeof rawSection.props === 'object'
      ? { ...rawSection, ...rawSection.props }
      : rawSection;
  return {
    title: String(propsSource.title || propsSource.checkout_title || '').trim(),
    message: String(propsSource.message || propsSource.checkout_message || '').trim(),
    badge_text: String(propsSource.badge_text || propsSource.checkout_badge_text || '').trim(),
    disclaimer: String(propsSource.disclaimer || propsSource.checkout_disclaimer || '').trim(),
    cta_label: String(propsSource.cta_label || propsSource.checkout_cta_label || '').trim(),
    tone: normalizeCheckoutTone(propsSource.tone || propsSource.checkout_tone),
    layout: normalizeCheckoutLayout(propsSource.layout || propsSource.checkout_layout),
    cta_kind: normalizeCheckoutCtaKind(propsSource.cta_kind || propsSource.checkout_cta_kind),
    feature_bullets: normalizeFeatureBullets(
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
    product_source_collections: normalizeProductSourceCollections(
      propsSource.product_source_collections ||
        propsSource.checkout_product_source_collections ||
        propsSource.product_source_collection_ids
    ),
    product_items: normalizeProductItems(
      propsSource.product_items || propsSource.checkout_product_items
    ),
  };
}

function normalizeCheckoutSection(rawSection = {}, index = 0) {
  const type = normalizeCheckoutSectionType(rawSection.type);
  return {
    id: toSectionId(rawSection.id, index, type),
    type,
    enabled: rawSection.enabled !== false,
    order: Number.isInteger(rawSection.order) ? rawSection.order : index,
    props: normalizeSectionProps(rawSection),
  };
}

function buildLegacySection(config = {}) {
  const props = normalizeSectionProps(config);
  const hasLegacyContent = hasRenderableSection({ enabled: true, props });
  if (!hasLegacyContent) {
    return [];
  }
  return [
    {
      id: 'hero-notice-1',
      type: 'hero_notice',
      enabled: true,
      order: 0,
      props,
    },
  ];
}

function normalizeCheckoutSections(config = {}) {
  const explicitSections = Array.isArray(config.checkout_sections)
    ? config.checkout_sections.map((section, index) => normalizeCheckoutSection(section, index))
    : null;
  if (explicitSections && explicitSections.length > 0) {
    return explicitSections.sort((a, b) => a.order - b.order);
  }
  return buildLegacySection(config);
}

function normalizeCheckoutExperienceConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  return {
    checkout_placement: normalizeCheckoutPlacement(
      source.checkout_placement || source.checkoutPlacement
    ),
    checkout_sections: normalizeCheckoutSections(source),
  };
}

function normalizeCheckoutExperienceVariantConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const normalized = normalizeCheckoutExperienceConfig(source);
  const primarySection = normalized.checkout_sections.find(section =>
    hasRenderableSection(section)
  );
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
    checkout_feature_bullets: normalizeFeatureBullets(props.feature_bullets),
  };
}

function normalizeCheckoutExperienceTestPayload(payload = {}) {
  if (!isCheckoutExperienceTestPayload(payload) || !Array.isArray(payload.variants)) {
    return payload;
  }
  return {
    ...payload,
    type: 'checkout',
    goal: {
      ...(payload.goal && typeof payload.goal === 'object' ? payload.goal : {}),
      checkout_phase: 'experience',
    },
    variants: payload.variants.map((variant, index) => {
      const current = variant && typeof variant === 'object' ? variant : {};
      return {
        ...current,
        id:
          current.id !== undefined && current.id !== null && String(current.id).trim() !== ''
            ? current.id
            : current.name || `variant-${index}`,
        config: normalizeCheckoutExperienceVariantConfig(current.config || {}),
      };
    }),
  };
}

function hasRenderableSection(section = {}) {
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
    (Array.isArray(props.feature_bullets) && props.feature_bullets.length > 0) ||
    props.product_source_mode === 'cart_related' ||
    (props.product_source_mode === 'collection' &&
      Array.isArray(props.product_source_collections) &&
      props.product_source_collections.length > 0) ||
    (Array.isArray(props.product_items) && props.product_items.some(hasRenderableProductItem))
  );
}

function validateCheckoutExperienceConfig(config = {}, options = {}) {
  const errors = [];
  const normalizedConfig = normalizeCheckoutExperienceConfig(config);
  const requireRenderableSection = options.requireRenderableSection !== false;
  const rawPlacement = String(config.checkout_placement || config.checkoutPlacement || '').trim();
  const rawSections = Array.isArray(config.checkout_sections) ? config.checkout_sections : null;

  if (
    rawPlacement &&
    !SUPPORTED_CHECKOUT_PLACEMENTS.includes(String(rawPlacement).trim().toLowerCase())
  ) {
    errors.push(`checkout_placement must be one of: ${SUPPORTED_CHECKOUT_PLACEMENTS.join(', ')}`);
  }

  if (rawSections && rawSections.length > MAX_CHECKOUT_SECTIONS) {
    errors.push(`checkout_sections cannot contain more than ${MAX_CHECKOUT_SECTIONS} sections`);
  }

  if (rawSections) {
    rawSections.forEach((rawSection, index) => {
      const rawType = String(rawSection?.type || '')
        .trim()
        .toLowerCase();
      if (rawType && !SUPPORTED_CHECKOUT_SECTION_TYPES.includes(rawType)) {
        errors.push(
          `checkout_sections[${index}] type must be one of: ${SUPPORTED_CHECKOUT_SECTION_TYPES.join(', ')}`
        );
      }
    });
  }

  normalizedConfig.checkout_sections.forEach((section, index) => {
    const props = section.props || {};
    if (!SUPPORTED_CHECKOUT_TONES.includes(props.tone)) {
      errors.push(`checkout_sections[${index}] tone is invalid`);
    }
    if (!SUPPORTED_CHECKOUT_LAYOUTS.includes(props.layout)) {
      errors.push(`checkout_sections[${index}] layout is invalid`);
    }
    if (!SUPPORTED_CHECKOUT_CTA_KINDS.includes(props.cta_kind)) {
      errors.push(`checkout_sections[${index}] cta_kind is invalid`);
    }
  });

  const actionableSections = normalizedConfig.checkout_sections.filter(section =>
    hasRenderableSection(section)
  );
  if (requireRenderableSection && actionableSections.length === 0) {
    errors.push(
      'checkout_sections must include at least one enabled section with content or legacy checkout copy'
    );
  }

  return {
    normalizedConfig,
    actionableSectionCount: actionableSections.length,
    errors,
  };
}

module.exports = {
  MAX_CHECKOUT_SECTIONS,
  SUPPORTED_CHECKOUT_CTA_KINDS,
  SUPPORTED_CHECKOUT_LAYOUTS,
  SUPPORTED_CHECKOUT_PLACEMENTS,
  SUPPORTED_CHECKOUT_SECTION_TYPES,
  SUPPORTED_CHECKOUT_TONES,
  hasRenderableSection,
  isCheckoutExperienceTestPayload,
  normalizeCheckoutExperienceConfig,
  normalizeCheckoutExperienceTestPayload,
  normalizeCheckoutExperienceVariantConfig,
  normalizeCheckoutLayout,
  normalizeCheckoutPhase,
  normalizeCheckoutPlacement,
  normalizeCheckoutSectionType,
  normalizeCheckoutTone,
  validateCheckoutExperienceConfig,
};
