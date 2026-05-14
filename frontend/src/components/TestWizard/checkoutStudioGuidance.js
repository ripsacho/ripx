export {
  getCheckoutStudioModeIssueCounts,
  getCheckoutStudioReadiness,
} from './checkout/checkoutStudioReadiness';

export function normalizeCheckoutStudioAnalyticsKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export function getCheckoutRuntimePreviewNotes({
  sectionType,
  productSourceMode,
  productAction,
  checkoutPhase,
}) {
  if (sectionType === 'product_list') {
    return [
      productSourceMode === 'collection'
        ? 'Preview uses placeholders until assignment hydration resolves Shopify products.'
        : null,
      productSourceMode === 'cart_related'
        ? 'Runtime rows depend on the shopper cart; an empty cart can render no products.'
        : null,
      productAction === 'add_to_cart'
        ? 'Add buttons require checkout cart-line API access and merchandise IDs at runtime.'
        : null,
    ].filter(Boolean);
  }
  return [
    checkoutPhase !== 'experience'
      ? 'Payment/delivery customizations are executed by Shopify Functions; this block preview shows supporting extension content only.'
      : null,
  ].filter(Boolean);
}

export function cloneCheckoutSectionsForVariant(sections = [], targetVariantIndex = 0) {
  return sections.map((section, sectionIndex) => ({
    ...section,
    id: `${section.id || section.type || 'section'}-${targetVariantIndex + 1}-${sectionIndex + 1}`,
    order: sectionIndex,
  }));
}
