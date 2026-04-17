import {
  getActionableCheckoutSections,
  normalizeCheckoutPhase,
  normalizeCheckoutListInput,
} from './checkoutSections';

export const CHECKOUT_SECTION_EVENT_DEFINITIONS = Object.freeze({
  checkout_section_impression: {
    label: 'Section impression',
    description: 'A checkout content section rendered for the shopper.',
  },
  checkout_section_cta_click: {
    label: 'Section CTA click',
    description: 'A shopper clicked the CTA inside a checkout content section.',
  },
  checkout_section_offer_apply: {
    label: 'Section offer apply',
    description: 'A shopper applied an offer from a checkout content section.',
  },
});

export function formatCheckoutSectionTypeLabel(rawValue) {
  const value = String(rawValue || '')
    .trim()
    .toLowerCase();
  if (!value) return 'Checkout section';
  return value
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatCheckoutSectionEventLabel(rawValue) {
  const key = String(rawValue || '')
    .trim()
    .toLowerCase();
  return CHECKOUT_SECTION_EVENT_DEFINITIONS[key]?.label || key.replace(/_/g, ' ') || 'Event';
}

export function isCheckoutSectionEventName(rawValue) {
  const key = String(rawValue || '')
    .trim()
    .toLowerCase();
  return Boolean(CHECKOUT_SECTION_EVENT_DEFINITIONS[key]);
}

export function normalizeCheckoutEventMetadata(rawValue) {
  if (!rawValue) return {};
  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return rawValue && typeof rawValue === 'object' ? rawValue : {};
}

export function getCheckoutSectionEventContext(rawEvent) {
  const event =
    rawEvent && typeof rawEvent === 'object' && !Array.isArray(rawEvent)
      ? rawEvent
      : { metadata: rawEvent };
  const metadata = normalizeCheckoutEventMetadata(event.metadata);
  const sectionId = String(
    metadata.checkout_section_id || metadata.section_id || metadata.checkoutSectionId || ''
  ).trim();
  const sectionType = String(
    metadata.checkout_section_type || metadata.section_type || metadata.checkoutSectionType || ''
  )
    .trim()
    .toLowerCase();
  const checkoutPhase = normalizeCheckoutPhase(metadata.checkout_phase);
  const offerCode = String(metadata.offer_code || '').trim();
  const sectionTypeLabel = sectionType ? formatCheckoutSectionTypeLabel(sectionType) : '';
  const summaryParts = [
    sectionTypeLabel,
    sectionId ? `ID: ${sectionId}` : null,
    offerCode ? `Offer: ${offerCode}` : null,
  ].filter(Boolean);

  return {
    metadata,
    sectionId,
    sectionType,
    sectionTypeLabel,
    checkoutPhase,
    offerCode,
    hasSectionContext: Boolean(sectionId || sectionType),
    summary: summaryParts.join(' · '),
  };
}

function isLikelyControlVariant(variant = {}, index = 0) {
  if (index === 0) return true;
  return /^control\b/i.test(String(variant?.name || '').trim());
}

export function getCheckoutExperienceTestInventory(tests = []) {
  return (Array.isArray(tests) ? tests : [])
    .filter(test => {
      const type = String(test?.type || '')
        .trim()
        .toLowerCase();
      return (
        type === 'checkout' && normalizeCheckoutPhase(test?.goal?.checkout_phase) === 'experience'
      );
    })
    .map(test => {
      const variants = Array.isArray(test?.variants) ? test.variants : [];
      const sectionTypes = new Set();
      const placements = new Set();
      let actionableVariants = 0;
      let totalRenderableSections = 0;
      let totalBullets = 0;

      variants.forEach((variant, index) => {
        if (isLikelyControlVariant(variant, index)) {
          return;
        }
        const config = variant?.config && typeof variant.config === 'object' ? variant.config : {};
        const sections = getActionableCheckoutSections(config);
        if (sections.length > 0) {
          actionableVariants += 1;
        }
        totalRenderableSections += sections.length;
        if (config.checkout_placement) {
          placements.add(String(config.checkout_placement).trim());
        }
        sections.forEach(section => {
          sectionTypes.add(section.type);
          totalBullets += normalizeCheckoutListInput(section?.props?.feature_bullets).length;
        });
      });

      return {
        id: test?.id || null,
        name: String(test?.name || 'Untitled checkout experience test').trim(),
        status: String(test?.status || 'draft').trim() || 'draft',
        actionableVariants,
        totalRenderableSections,
        totalBullets,
        sectionTypes: Array.from(sectionTypes),
        sectionTypeLabels: Array.from(sectionTypes).map(formatCheckoutSectionTypeLabel),
        placements: Array.from(placements).filter(Boolean),
      };
    })
    .filter(item => item.id);
}

export function summarizeCheckoutExperienceInventory(items = []) {
  const list = Array.isArray(items) ? items : [];
  return list.reduce(
    (summary, item) => {
      summary.testCount += 1;
      summary.actionableVariants += Number(item?.actionableVariants || 0);
      summary.renderableSections += Number(item?.totalRenderableSections || 0);
      summary.totalBullets += Number(item?.totalBullets || 0);
      (Array.isArray(item?.sectionTypes) ? item.sectionTypes : []).forEach(type => {
        summary.sectionTypes.add(type);
      });
      return summary;
    },
    {
      testCount: 0,
      actionableVariants: 0,
      renderableSections: 0,
      totalBullets: 0,
      sectionTypes: new Set(),
    }
  );
}
