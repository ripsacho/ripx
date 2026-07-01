/**
 * Documentation IA: browse modes and curated feature-guide paths.
 * Feature guides live as a mode on /docs (not a separate route) so deep links,
 * search, and Test Wizard anchors stay on one surface.
 */

export const DOC_MODES = [
  {
    id: 'all',
    label: 'Full library',
    shortLabel: 'All',
    description: 'Every section — setup, product features, integrations, and advanced topics.',
  },
  {
    id: 'feature-guides',
    label: 'Feature guides',
    shortLabel: 'Guides',
    description: 'Task-oriented paths for choosing, launching, and analyzing experiments.',
  },
  {
    id: 'setup',
    label: 'Setup & onboarding',
    shortLabel: 'Setup',
    description: 'Connect stores, install snippets, and finish launch readiness.',
  },
  {
    id: 'developer',
    label: 'Developer',
    shortLabel: 'Developer',
    description: 'Local dev, API reference, storefront script, and platform internals.',
  },
];

/** Section IDs visible in each mode (`all` = no filter). */
export const DOC_MODE_SECTION_IDS = {
  all: null,
  'feature-guides': [
    'overview',
    'dashboard',
    'tests',
    'test-decision-guide',
    'launch-preflight',
    'price-testing',
    'offer-testing',
    'checkout-studio',
    'shipping-tests',
    'onsite-split-url',
    'theme-template-tests',
    'data-flow',
    'storefront',
    'test-wizard',
    'targeting',
    'goals-metrics',
    'analytics',
    'heatmap-funnel',
    'settings',
  ],
  setup: [
    'overview',
    'installation',
    'setup-wizard',
    'connect',
    'my-domains',
    'settings',
    'launch-preflight',
    'integrations',
    'support-agent',
  ],
  developer: [
    'getting-started',
    'local-dev',
    'api',
    'storefront',
    'multi-platform',
    'webhooks',
    'data-flow',
    'automation-guardrails',
    'admin-ops',
  ],
};

/** Curated multi-step paths shown at the top of Feature guides mode. */
export const FEATURE_GUIDE_PATHS = [
  {
    id: 'store-setup',
    title: 'Connect and verify your store',
    summary:
      'Install RipX on Shopify, enable the theme embed, attach checkout functions, and pass launch preflight.',
    mode: 'setup',
    sectionIds: ['installation', 'setup-wizard', 'settings', 'launch-preflight'],
    duration: '15–20 min',
    difficulty: 'Foundation',
    outcome: 'Verified install, app proxy, embed, and launch checklist.',
  },
  {
    id: 'choose-test',
    title: 'Choose the right test type',
    summary:
      'Use the decision guide when you are unsure between price, offer, shipping, checkout, theme, or onsite tests.',
    sectionIds: ['test-decision-guide', 'tests'],
    duration: '5 min',
    difficulty: 'Foundation',
    outcome: 'Pick the right experiment surface before configuring traffic.',
  },
  {
    id: 'price-test',
    title: 'Run a Shopify price test',
    summary:
      'Align PDP display, cart line properties, and checkout discount behavior before you launch traffic.',
    sectionIds: ['price-testing', 'data-flow', 'launch-preflight'],
    duration: '20 min',
    difficulty: 'Advanced',
    outcome: 'PDP/cart/checkout price behavior aligned before traffic launch.',
  },
  {
    id: 'shipping-test',
    title: 'Run a shipping rate test',
    summary:
      'Configure carrier rates, delivery customization, preview flows, and shipping diagnostics.',
    sectionIds: ['shipping-tests', 'launch-preflight'],
    duration: '15 min',
    difficulty: 'Advanced',
    outcome: 'Delivery rates, preview, and checkout diagnostics validated.',
  },
  {
    id: 'offer-checkout',
    title: 'Run offer or checkout experiments',
    summary:
      'Set up offer checkout functions, Checkout Studio blocks, and readiness checks for checkout UI tests.',
    sectionIds: ['offer-testing', 'checkout-studio', 'launch-preflight'],
    duration: '20 min',
    difficulty: 'Advanced',
    outcome: 'Offer, checkout UI, and function readiness checked together.',
  },
  {
    id: 'analyze-results',
    title: 'Read results with confidence',
    summary:
      'Interpret significance, funnels, heatmaps, and guardrails before you roll a winner live.',
    sectionIds: ['goals-metrics', 'analytics', 'heatmap-funnel', 'launch-preflight'],
    duration: '10 min',
    difficulty: 'Intermediate',
    outcome: 'Winner decisions grounded in goals, funnels, and guardrails.',
  },
  {
    id: 'goals-library',
    title: 'Build a reusable goals library',
    summary:
      'Define primary, secondary, and guardrail metrics once, then attach them across tests in the wizard.',
    sectionIds: ['goals-metrics', 'test-wizard', 'analytics'],
    duration: '10 min',
    difficulty: 'Intermediate',
    outcome: 'Reusable metric library ready for future experiments.',
  },
  {
    id: 'storefront-qa',
    title: 'Run storefront QA before launch',
    summary:
      'Verify script loading, variant assignment, anti-flicker behavior, heatmap capture, and launch preflight.',
    sectionIds: ['storefront', 'data-flow', 'launch-preflight', 'heatmap-funnel'],
    duration: '12 min',
    difficulty: 'Advanced',
    outcome: 'Storefront instrumentation validated before customer traffic.',
  },
];

export const FEATURE_GUIDE_DECISION_CARDS = [
  {
    id: 'price-margin',
    title: 'Changing price or margin?',
    description: 'Start with price testing, then confirm checkout alignment and launch preflight.',
    sectionId: 'price-testing',
    signal: 'Revenue / margin',
  },
  {
    id: 'promotion',
    title: 'Testing offers or discounts?',
    description:
      'Use offer testing with checkout studio when the promotion changes checkout behavior.',
    sectionId: 'offer-testing',
    signal: 'Promotion',
  },
  {
    id: 'delivery',
    title: 'Changing delivery promise?',
    description: 'Use shipping tests and validate delivery customization before launch.',
    sectionId: 'shipping-tests',
    signal: 'Shipping',
  },
  {
    id: 'checkout-ux',
    title: 'Changing checkout UX?',
    description:
      'Use Checkout Studio and pair it with readiness checks for functions and UI blocks.',
    sectionId: 'checkout-studio',
    signal: 'Checkout',
  },
  {
    id: 'content-theme',
    title: 'Changing page content or theme?',
    description:
      'Use onsite edit, split URL, or theme/template tests depending on the surface area.',
    sectionId: 'onsite-split-url',
    signal: 'Experience',
  },
  {
    id: 'measurement',
    title: 'Unsure what success means?',
    description: 'Build goals and guardrails first so every test has a measurable decision rule.',
    sectionId: 'goals-metrics',
    signal: 'Measurement',
  },
];

export const DOC_AUDIENCE_JOURNEYS = [
  {
    id: 'merchant',
    audience: 'Merchant operator',
    title: 'Launch a safe experiment',
    description: 'Connect the store, choose the test type, verify setup, and read results.',
    mode: 'feature-guides',
    sectionIds: ['installation', 'test-decision-guide', 'launch-preflight', 'analytics'],
  },
  {
    id: 'growth',
    audience: 'Growth team',
    title: 'Build a repeatable testing program',
    description: 'Standardize goals, targeting, playbooks, and rollout decisions.',
    mode: 'feature-guides',
    sectionIds: ['goals-metrics', 'targeting', 'test-wizard', 'heatmap-funnel'],
  },
  {
    id: 'developer',
    audience: 'Developer',
    title: 'Validate platform integration',
    description: 'Inspect local setup, API surfaces, storefront script behavior, and webhooks.',
    mode: 'developer',
    sectionIds: ['local-dev', 'api', 'storefront', 'webhooks'],
  },
  {
    id: 'support',
    audience: 'Support / success',
    title: 'Triage setup and launch blockers',
    description: 'Use setup diagnostics, contextual help, preflight checks, and support workflows.',
    mode: 'setup',
    sectionIds: ['setup-wizard', 'settings', 'launch-preflight', 'support-agent'],
  },
];

export const DOC_RESEARCH_LIBRARY = [
  {
    id: 'price-research',
    title: 'Shopify price testing research',
    source: 'docs/research/SHOPIFY_PRICE_TESTING.md',
    summary: 'Market context, constraints, and patterns for price experiments on Shopify.',
    mode: 'feature-guides',
    sectionId: 'price-testing',
    tags: ['Price', 'Research'],
  },
  {
    id: 'advanced-price',
    title: 'Advanced price testing research',
    source: 'docs/research/ADVANCED_PRICE_TESTING_RESEARCH.md',
    summary: 'Deeper tactics for segmentation, checkout alignment, and risk controls.',
    mode: 'feature-guides',
    sectionId: 'price-testing',
    tags: ['Price', 'Advanced'],
  },
  {
    id: 'checkout-resolver',
    title: 'Checkout price resolver runbook',
    source: 'docs/SHOPIFY_CHECKOUT_PRICE_RESOLVER.md',
    summary: 'Resolver architecture, batch endpoint expectations, and checkout discount behavior.',
    mode: 'feature-guides',
    sectionId: 'checkout-studio',
    tags: ['Checkout', 'Runbook'],
  },
  {
    id: 'shipping-runbook',
    title: 'Shipping test runbook',
    source: 'docs/SHOPIFY_SHIPPING_TEST_RUNBOOK.md',
    summary: 'Carrier service, delivery customization, preview, and diagnostics workflow.',
    mode: 'feature-guides',
    sectionId: 'shipping-tests',
    tags: ['Shipping', 'Runbook'],
  },
  {
    id: 'theme-preflight',
    title: 'Theme test preflight and troubleshooting',
    source: 'docs/THEME_TEST_PREFLIGHT_AND_TROUBLESHOOTING.md',
    summary: 'Theme/template test QA, selector checks, and storefront troubleshooting.',
    mode: 'feature-guides',
    sectionId: 'theme-template-tests',
    tags: ['Theme', 'QA'],
  },
  {
    id: 'analytics-hardening',
    title: 'Analytics hardening runbook',
    source: 'backend/docs/ANALYTICS_HARDENING_RUNBOOK.md',
    summary: 'Operational checks for analytics reliability, metrics, and attribution quality.',
    mode: 'feature-guides',
    sectionId: 'analytics',
    tags: ['Analytics', 'Operations'],
  },
  {
    id: 'hosted-app-setup',
    title: 'Shopify hosted app setup',
    source: 'docs/SHOPIFY_HOSTED_APP_SETUP.md',
    summary: 'Hosted app, redirect, tunnel, and embedded-app setup guidance.',
    mode: 'setup',
    sectionId: 'installation',
    tags: ['Setup', 'Shopify'],
  },
  {
    id: 'api-operations',
    title: 'API and operations reference',
    source: 'docs/API_AND_OPERATIONS_REFERENCE.md',
    summary: 'Operational API groups, health checks, and production support references.',
    mode: 'developer',
    sectionId: 'api',
    tags: ['API', 'Ops'],
  },
];

export const DOC_MODE_STORAGE_KEY = 'ripx_docs_mode_v1';
export const DOC_TABS_STORAGE_KEY = 'ripx_docs_tabs_v1';
export const DOC_HUB_TAB_ID = '__guide-hub__';

/** Prefix for section tab ids persisted in session storage. */
export function buildSectionTabId(sectionId) {
  return `section:${String(sectionId || '').trim()}`;
}

export function parseSectionTabId(tabId) {
  const raw = String(tabId || '');
  return raw.startsWith('section:') ? raw.slice('section:'.length) : null;
}

export function isHubTabId(tabId) {
  return tabId === DOC_HUB_TAB_ID;
}

export function normalizeDocTab(raw, { sections = [] } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  if (isHubTabId(id)) {
    return { id: DOC_HUB_TAB_ID, kind: 'hub', closable: raw.closable !== false };
  }
  const sectionId = parseSectionTabId(id);
  if (sectionId && sections.some(section => section.id === sectionId)) {
    return { id: buildSectionTabId(sectionId), kind: 'section', closable: raw.closable !== false };
  }
  return null;
}

export function createDefaultDocTabs(sectionId = 'overview') {
  const normalizedSection = String(sectionId || 'overview').trim() || 'overview';
  return [
    { id: DOC_HUB_TAB_ID, kind: 'hub', closable: true },
    { id: buildSectionTabId(normalizedSection), kind: 'section', closable: true },
  ];
}

export function getDocTabLabel(tab, sectionsById = {}) {
  if (!tab) return '';
  if (isHubTabId(tab.id)) return 'Guide hub';
  const sectionId = parseSectionTabId(tab.id);
  if (sectionId) {
    return sectionsById[sectionId]?.title || sectionId;
  }
  return tab.id;
}

export function readPersistedDocTabs({ sections = [] } = {}) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DOC_TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const tabs = parsed.map(item => normalizeDocTab(item, { sections })).filter(Boolean);
    return tabs.length > 0 ? tabs : null;
  } catch {
    return null;
  }
}

export function persistDocTabs(tabs) {
  if (typeof window === 'undefined') return;
  try {
    const list = Array.isArray(tabs) ? tabs : [];
    if (list.length === 0) {
      window.sessionStorage.removeItem(DOC_TABS_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(DOC_TABS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Visual kind badges shown on each doc section header. */
export const SECTION_KINDS = {
  overview: { id: 'guide', label: 'Guide' },
  dashboard: { id: 'guide', label: 'Guide' },
  tests: { id: 'guide', label: 'Guide' },
  'test-decision-guide': { id: 'guide', label: 'Guide' },
  'launch-preflight': { id: 'guide', label: 'Guide' },
  'price-testing': { id: 'guide', label: 'Feature guide' },
  'offer-testing': { id: 'guide', label: 'Feature guide' },
  'checkout-studio': { id: 'guide', label: 'Feature guide' },
  'shipping-tests': { id: 'guide', label: 'Feature guide' },
  'onsite-split-url': { id: 'guide', label: 'Feature guide' },
  'theme-template-tests': { id: 'guide', label: 'Feature guide' },
  'test-wizard': { id: 'guide', label: 'Guide' },
  targeting: { id: 'guide', label: 'Guide' },
  'goals-metrics': { id: 'guide', label: 'Feature guide' },
  analytics: { id: 'guide', label: 'Guide' },
  'heatmap-funnel': { id: 'guide', label: 'Guide' },
  installation: { id: 'setup', label: 'Setup' },
  'setup-wizard': { id: 'setup', label: 'Setup' },
  connect: { id: 'setup', label: 'Setup' },
  'my-domains': { id: 'setup', label: 'Setup' },
  settings: { id: 'setup', label: 'Setup' },
  integrations: { id: 'setup', label: 'Setup' },
  'getting-started': { id: 'dev', label: 'Developer' },
  'local-dev': { id: 'dev', label: 'Developer' },
  api: { id: 'dev', label: 'API reference' },
  storefront: { id: 'dev', label: 'Developer' },
  webhooks: { id: 'dev', label: 'Developer' },
  'multi-platform': { id: 'dev', label: 'Developer' },
  'admin-ops': { id: 'dev', label: 'Operations' },
  'data-flow': { id: 'reference', label: 'Reference' },
  'automation-guardrails': { id: 'reference', label: 'Reference' },
  'promo-links': { id: 'reference', label: 'Reference' },
  export: { id: 'reference', label: 'Reference' },
  'profile-notifications': { id: 'reference', label: 'Reference' },
  'support-agent': { id: 'reference', label: 'Reference' },
};

/** Curated “see also” links per section (ids must exist in SECTIONS). */
export const RELATED_SECTIONS = {
  overview: ['test-decision-guide', 'installation', 'analytics'],
  installation: ['setup-wizard', 'settings', 'launch-preflight'],
  'price-testing': ['data-flow', 'launch-preflight', 'settings'],
  'offer-testing': ['checkout-studio', 'launch-preflight', 'data-flow'],
  'checkout-studio': ['offer-testing', 'shipping-tests', 'launch-preflight'],
  'shipping-tests': ['checkout-studio', 'launch-preflight', 'settings'],
  'test-wizard': ['targeting', 'goals-metrics', 'launch-preflight'],
  'goals-metrics': ['test-wizard', 'analytics', 'automation-guardrails'],
  analytics: ['goals-metrics', 'heatmap-funnel', 'launch-preflight'],
  'heatmap-funnel': ['analytics', 'storefront', 'data-flow'],
  settings: ['installation', 'integrations', 'launch-preflight'],
  'launch-preflight': ['test-decision-guide', 'settings', 'analytics'],
  api: ['storefront', 'webhooks', 'getting-started'],
  storefront: ['installation', 'data-flow', 'heatmap-funnel'],
};

/** Footer resource chips scoped by browse mode. */
export const DOCS_FOOTER_RESOURCES = {
  all: [
    { type: 'section', sectionId: 'settings', label: 'Store settings' },
    { type: 'section', sectionId: 'launch-preflight', label: 'Launch preflight' },
    { type: 'section', sectionId: 'test-decision-guide', label: 'Test decision guide' },
    { type: 'external', href: '/api-docs', label: 'API Docs (Swagger)' },
    { type: 'route', path: 'support', label: 'Support' },
  ],
  'feature-guides': [
    { type: 'section', sectionId: 'price-testing', label: 'Price testing' },
    { type: 'section', sectionId: 'shipping-tests', label: 'Shipping tests' },
    { type: 'section', sectionId: 'goals-metrics', label: 'Goals & metrics' },
    { type: 'section', sectionId: 'launch-preflight', label: 'Launch preflight' },
    { type: 'route', path: 'support', label: 'Support' },
  ],
  setup: [
    { type: 'section', sectionId: 'installation', label: 'Installation' },
    { type: 'section', sectionId: 'setup-wizard', label: 'Setup wizard' },
    { type: 'section', sectionId: 'settings', label: 'Store settings' },
    { type: 'section', sectionId: 'my-domains', label: 'My domains' },
    { type: 'route', path: 'connect', label: 'Connect / API key' },
  ],
  developer: [
    { type: 'external', href: '/api-docs', label: 'API Docs (Swagger)' },
    { type: 'section', sectionId: 'api', label: 'API reference' },
    { type: 'section', sectionId: 'storefront', label: 'Storefront script' },
    { type: 'section', sectionId: 'local-dev', label: 'Local Shopify dev' },
    { type: 'section', sectionId: 'webhooks', label: 'Webhooks' },
  ],
};

export function normalizeDocMode(raw) {
  const id = String(raw || 'all')
    .trim()
    .toLowerCase();
  return DOC_MODES.some(mode => mode.id === id) ? id : 'all';
}

export function getDocModeMeta(modeId) {
  return DOC_MODES.find(mode => mode.id === modeId) || DOC_MODES[0];
}

export function sectionMatchesDocMode(sectionId, mode) {
  const normalized = normalizeDocMode(mode);
  const ids = DOC_MODE_SECTION_IDS[normalized];
  if (!ids) return true;
  return ids.includes(String(sectionId || '').trim());
}

export function filterSectionsByDocMode(sections, mode) {
  const list = Array.isArray(sections) ? sections : [];
  const normalized = normalizeDocMode(mode);
  if (normalized === 'all') return list;
  return list.filter(section => sectionMatchesDocMode(section.id, normalized));
}

export function findDocModeForSection(sectionId) {
  const id = String(sectionId || '').trim();
  if (!id) return 'all';
  for (const mode of DOC_MODES) {
    if (mode.id === 'all') continue;
    if (sectionMatchesDocMode(id, mode.id)) return mode.id;
  }
  return 'all';
}

export function buildDocsUrl({ mode, sectionId } = {}) {
  const params = new URLSearchParams();
  const normalizedMode = normalizeDocMode(mode);
  if (normalizedMode !== 'all') {
    params.set('mode', normalizedMode);
  }
  const query = params.toString();
  const hash = sectionId ? `#${sectionId}` : '';
  return query ? `/docs?${query}${hash}` : `/docs${hash}`;
}

export function getSectionKindMeta(sectionId) {
  return SECTION_KINDS[sectionId] || { id: 'reference', label: 'Reference' };
}

export function getRelatedSectionIds(sectionId) {
  const related = RELATED_SECTIONS[sectionId];
  return Array.isArray(related) ? related : [];
}

export function getDocsFooterResources(mode) {
  const normalized = normalizeDocMode(mode);
  return DOCS_FOOTER_RESOURCES[normalized] || DOCS_FOOTER_RESOURCES.all;
}

export function getFeatureGuideStats(paths = FEATURE_GUIDE_PATHS) {
  const list = Array.isArray(paths) ? paths : [];
  const sectionIds = new Set();
  let totalSteps = 0;
  list.forEach(path => {
    const ids = Array.isArray(path.sectionIds) ? path.sectionIds : [];
    totalSteps += ids.length;
    ids.forEach(id => sectionIds.add(id));
  });
  return {
    pathCount: list.length,
    uniqueSectionCount: sectionIds.size,
    totalStepCount: totalSteps,
  };
}

export function getFeatureGuideDecisionCards() {
  return FEATURE_GUIDE_DECISION_CARDS;
}

export function getAudienceJourneys(mode = 'all') {
  const normalized = normalizeDocMode(mode);
  if (normalized === 'all') return DOC_AUDIENCE_JOURNEYS;
  return DOC_AUDIENCE_JOURNEYS.filter(journey => normalizeDocMode(journey.mode) === normalized);
}

export function getResearchLibraryForMode(mode = 'all') {
  const normalized = normalizeDocMode(mode);
  if (normalized === 'all') return DOC_RESEARCH_LIBRARY;
  return DOC_RESEARCH_LIBRARY.filter(resource => normalizeDocMode(resource.mode) === normalized);
}

export function readPersistedDocMode() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DOC_MODE_STORAGE_KEY);
    return raw ? normalizeDocMode(raw) : null;
  } catch {
    return null;
  }
}

export function persistDocMode(mode) {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeDocMode(mode);
    if (normalized === 'all') {
      window.sessionStorage.removeItem(DOC_MODE_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(DOC_MODE_STORAGE_KEY, normalized);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
