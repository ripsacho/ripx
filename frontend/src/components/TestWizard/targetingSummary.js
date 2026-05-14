import {
  HOMEPAGE_URL_PATTERN_SHOPIFY,
  HOMEPAGE_URL_PATTERN_STANDALONE,
} from './wizardCheckoutConstants';
import { advancedSectionHasActivity, buildAdvancedSummary } from './advancedTargeting';
import { hasCustomAudienceRules, summarizeAudienceTargeting } from './customAudienceRules';

function normalizeHoldoutPercent(raw) {
  if (raw === '' || raw === null || raw === undefined) {
    return 0;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function buildPageScopeSummary(options) {
  const {
    formData,
    isCheckoutTestType,
    isShippingTestType,
    isShippingStorewideAdvanced,
    selectedScopeProductCount,
    excludedScopeProductCount,
    customUrlModeActive,
  } = options;

  if (isCheckoutTestType) {
    return 'Checkout only';
  }

  if (isShippingTestType) {
    const scopeLabel = isShippingStorewideAdvanced
      ? 'Storewide carts'
      : `${selectedScopeProductCount || 0} included product${
          selectedScopeProductCount === 1 ? '' : 's'
        }`;
    const excludedLabel =
      excludedScopeProductCount > 0 ? ` · ${excludedScopeProductCount} excluded` : '';
    return `${scopeLabel}${excludedLabel}`;
  }

  const pageRules = formData?.segments?.page_rules || [];
  const urlPattern = formData?.segments?.url_pattern ?? '';
  if (pageRules.length > 0) {
    return `${pageRules.length} page rule${pageRules.length > 1 ? 's' : ''}`;
  }
  if (!urlPattern || urlPattern === ' ') {
    return 'All pages';
  }
  if (
    urlPattern === HOMEPAGE_URL_PATTERN_SHOPIFY ||
    urlPattern === HOMEPAGE_URL_PATTERN_STANDALONE
  ) {
    return 'Homepage';
  }
  if (urlPattern === '/products/') {
    return 'Products';
  }
  if (urlPattern === '/collections/') {
    return 'Collections';
  }
  if (urlPattern === '/cart') {
    return 'Cart';
  }
  if (customUrlModeActive || String(urlPattern).trim()) {
    return 'Custom';
  }
  return 'All pages';
}

function buildAudienceSummary(options) {
  const { formData, countriesSummary } = options;
  return summarizeAudienceTargeting(formData?.segments || {}, countriesSummary);
}

function pageSectionHasActivity(options) {
  const { formData, customUrlModeActive, selectedScopeProductCount, isShippingTestType } = options;
  if (isShippingTestType) {
    return selectedScopeProductCount > 0;
  }
  return (
    (formData?.segments?.page_rules || []).length > 0 ||
    (customUrlModeActive && String(formData?.segments?.url_pattern ?? '').trim() !== '')
  );
}

function audienceSectionHasActivity(formData) {
  const segments = formData?.segments || {};
  return (
    hasCustomAudienceRules(segments) ||
    (segments.device || 'all') !== 'all' ||
    (segments.customer || 'all') !== 'all' ||
    (segments.countries || []).length > 0 ||
    (segments.traffic_source || 'all') !== 'all' ||
    (segments.operating_system || 'all') !== 'all'
  );
}

/**
 * @param {Object} options
 * @returns {{ atAGlance: string, railSections: Array<{ id: string, step: number, label: string, detail: string, showActivityDot: boolean }> }}
 */
export function buildTargetingSummary(options = {}) {
  const {
    formData = {},
    isStandalone = false,
    isCheckoutTestType = false,
    isShippingTestType = false,
    targetingScopeFixedForCommerce = false,
    isShippingStorewideAdvanced = false,
    selectedScopeProductCount = 0,
    excludedScopeProductCount = 0,
    countriesSummary = '',
    customUrlModeActive = false,
  } = options;

  const holdoutPercent = normalizeHoldoutPercent(formData.holdout_percent);
  const pageDetail = buildPageScopeSummary({
    formData,
    isCheckoutTestType,
    isShippingTestType,
    isShippingStorewideAdvanced,
    selectedScopeProductCount,
    excludedScopeProductCount,
    customUrlModeActive,
  });
  const audienceDetail = buildAudienceSummary({ formData, countriesSummary });
  const holdoutDetail = `${holdoutPercent}% reserved`;
  const advancedDetail = buildAdvancedSummary(formData);

  const pageLabel = isCheckoutTestType
    ? 'Checkout scope'
    : isShippingTestType
      ? 'Qualification'
      : targetingScopeFixedForCommerce
        ? 'Product scope'
        : 'Page';

  const railSections = [
    {
      id: 'page',
      step: 1,
      label: pageLabel,
      detail: pageDetail,
      showActivityDot: pageSectionHasActivity({
        formData,
        customUrlModeActive,
        selectedScopeProductCount,
        isShippingTestType,
      }),
    },
  ];

  if (!isStandalone) {
    railSections.push({
      id: 'audience',
      step: 2,
      label: 'Audience',
      detail: audienceDetail,
      showActivityDot: audienceSectionHasActivity(formData),
    });
  }

  const holdoutStep = isStandalone ? 2 : 3;
  railSections.push({
    id: 'holdout',
    step: holdoutStep,
    label: 'Holdout',
    detail: holdoutDetail,
    showActivityDot: holdoutPercent > 0,
  });

  const advancedStep = isStandalone ? 3 : 4;
  railSections.push({
    id: 'advanced',
    step: advancedStep,
    label: 'Advanced',
    detail: advancedDetail,
    showActivityDot: advancedSectionHasActivity(formData),
  });

  const holdoutLabel = `${holdoutPercent}% holdout`;

  const atAGlance = isStandalone
    ? `${pageDetail} · ${holdoutLabel}`
    : isShippingTestType
      ? `${pageDetail} · ${holdoutLabel}`
      : isCheckoutTestType
        ? `${pageDetail} · ${audienceDetail} · ${holdoutLabel}`
        : `${pageDetail} · ${audienceDetail} · ${holdoutLabel}`;

  return {
    atAGlance,
    railSections,
  };
}
