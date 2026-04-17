export const CHECKOUT_SECTION_TYPES = [
  'hero_notice',
  'trust_box',
  'guarantee_box',
  'shipping_promise',
  'offer_code_panel',
];

export const CHECKOUT_PLACEMENTS = ['purchase.checkout.block.render'];
export const CHECKOUT_TONES = ['success', 'info', 'warning', 'critical'];
export const CHECKOUT_LAYOUTS = ['banner', 'stacked', 'compact'];
export const CHECKOUT_CTA_KINDS = ['track', 'offer_code', 'none'];

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

export function createEmptyCheckoutSection(index = 0, type = 'hero_notice') {
  return {
    id: `${normalizeCheckoutSectionType(type)}-${index + 1}`,
    type: normalizeCheckoutSectionType(type),
    enabled: true,
    order: index,
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
    },
  };
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
  };
}

export function normalizeCheckoutSection(section = {}, index = 0) {
  const type = normalizeCheckoutSectionType(section.type);
  return {
    id: normalizeCheckoutSectionId(section.id, index, type),
    type,
    enabled: section.enabled !== false,
    order: Number.isInteger(section.order) ? section.order : index,
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
    normalizeCheckoutListInput(props.feature_bullets).length > 0
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
    checkout_feature_bullets: normalizeCheckoutListInput(props.feature_bullets),
  };
}
