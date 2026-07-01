export const ASSISTANT_FAQS = [
  {
    id: 'connect',
    category: 'Setup',
    question: 'How do I connect a Shopify store?',
    answer:
      'Open Domains, choose the Shopify store, complete the install flow, then verify the app embed/script from Store settings → Store setup. If the store is still not verified, ask RipX Agent to inspect script and domain readiness.',
    tags: ['shopify', 'install', 'domain'],
    routes: ['setup', 'settings', 'domains'],
  },
  {
    id: 'not-ready',
    category: 'Testing',
    question: 'Why is my test not ready?',
    answer:
      'Check script verification, targeting, active status, checkout readiness, and whether variants are valid. RipX Agent can inspect the current store/test context for blockers.',
    tags: ['readiness', 'launch', 'blocker'],
    routes: ['tests', 'setup'],
  },
  {
    id: 'traffic',
    category: 'Testing',
    question: 'What does traffic allocation mean?',
    answer:
      'Traffic allocation controls how visitors are split across variants. Keep allocations adding up to 100%, avoid changing them too often mid-test, and watch for sample ratio mismatch in analytics.',
    tags: ['allocation', 'variants', 'srm'],
    routes: ['tests', 'analytics'],
  },
  {
    id: 'analytics',
    category: 'Analytics',
    question: 'Why do analytics numbers look different across reports?',
    answer:
      'Overview, Funnel, Heatmap, and Events answer different questions. Segment filters, date windows, conversion windows, and event availability can change the numbers. Use the analytics health cards to see which reports are ready.',
    tags: ['reports', 'events', 'funnel', 'heatmap'],
    routes: ['analytics'],
  },
  {
    id: 'promote',
    category: 'Analytics',
    question: 'When should I promote a winner?',
    answer:
      'Promote only after the decision readiness checks are clear: enough visitors, no serious SRM issue, guardrails acceptable, and the primary metric has a reliable winner. If blocked, open readiness details first.',
    tags: ['winner', 'promotion', 'decision'],
    routes: ['analytics', 'tests'],
  },
  {
    id: 'checkout',
    category: 'Checkout',
    question: 'Why is checkout testing not working?',
    answer:
      'Checkout tests depend on Shopify extension deployment, checkout readiness, app configuration, and the correct store context. Use RipX Agent for a store-aware check before opening a support ticket.',
    tags: ['checkout', 'extension', 'shopify'],
    routes: ['checkout', 'settings', 'setup'],
  },
  {
    id: 'agent-vs-support',
    category: 'Support',
    question: 'When should I use RipX Agent?',
    answer:
      'Use RipX Agent for store-aware diagnostics and confirmed actions. Use CustomerSupport when you need the RipX team to investigate directly.',
    tags: ['agent', 'support', 'help'],
    routes: ['support', 'general'],
  },
];

export const FAQ_ALL_CATEGORY = 'All';

export function getFaqCategories(faqs = ASSISTANT_FAQS) {
  return [
    FAQ_ALL_CATEGORY,
    ...Array.from(new Set(faqs.map(item => item.category).filter(Boolean))),
  ];
}

export function filterFaqs({
  faqs = ASSISTANT_FAQS,
  query = '',
  category = FAQ_ALL_CATEGORY,
} = {}) {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();
  return faqs.filter(item => {
    const categoryMatches = category === FAQ_ALL_CATEGORY || item.category === category;
    if (!categoryMatches) return false;
    if (!normalizedQuery) return true;
    return `${item.question} ${item.answer} ${item.category} ${(item.tags || []).join(' ')}`
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function resolveSelectedFaq({
  faqs = ASSISTANT_FAQS,
  visibleFaqs = faqs,
  selectedFaqId,
} = {}) {
  return (
    visibleFaqs.find(item => item.id === selectedFaqId) ||
    visibleFaqs[0] ||
    faqs.find(item => item.id === selectedFaqId) ||
    faqs[0] ||
    null
  );
}

export function getRecommendedFaqs({
  faqs = ASSISTANT_FAQS,
  pathname = '',
  page = '',
  limit = 3,
} = {}) {
  const haystack = `${pathname} ${page}`.toLowerCase();
  const scored = faqs
    .map(item => {
      const score = (item.routes || []).reduce(
        (sum, route) => sum + (route && haystack.includes(String(route).toLowerCase()) ? 1 : 0),
        0
      );
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);
  const matched = scored.filter(row => row.score > 0).map(row => row.item);
  return (matched.length ? matched : faqs).slice(0, limit);
}

export function normalizeRecentFaqIds(value, knownFaqs = ASSISTANT_FAQS) {
  const known = new Set(knownFaqs.map(item => item.id));
  const raw = Array.isArray(value) ? value : [];
  return raw.filter((id, index) => known.has(id) && raw.indexOf(id) === index).slice(0, 5);
}

export function addRecentFaqId(recentIds = [], faqId, knownFaqs = ASSISTANT_FAQS) {
  return normalizeRecentFaqIds([faqId, ...recentIds.filter(id => id !== faqId)], knownFaqs);
}

export function getFaqsByIds(ids = [], faqs = ASSISTANT_FAQS) {
  const byId = new Map(faqs.map(item => [item.id, item]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

export function buildFaqAgentPrompt(faq, context = {}) {
  const route = context?.pathname ? `\nCurrent page: ${context.pathname}` : '';
  return `I read this RipX FAQ and need store-aware help.\n\nFAQ category: ${faq?.category || 'General'}\nQuestion: ${faq?.question || 'Help with RipX'}\nAnswer I saw: ${faq?.answer || 'No answer selected.'}${route}`;
}

export function buildFaqSupportMessage(faq, context = {}) {
  const search = context?.search ? `\nSearch query: ${context.search}` : '';
  const route = context?.pathname ? `\nCurrent page: ${context.pathname}` : '';
  return `I still need help after reading a RipX FAQ.\n\nFAQ category: ${faq?.category || 'General'}\nQuestion: ${faq?.question || 'Help with RipX'}\nAnswer shown: ${faq?.answer || 'No answer selected.'}${search}${route}`;
}

export function buildNoResultAgentPrompt(query, context = {}) {
  const route = context?.pathname ? `\nCurrent page: ${context.pathname}` : '';
  const search = String(query || '').trim() || 'I need help with RipX.';
  return `I could not find a matching FAQ for this question.\n\nUser search: ${search}${route}`;
}

export function getNextFaqIdForKey({ visibleFaqs = [], currentFaqId, key } = {}) {
  if (!visibleFaqs.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
    return currentFaqId || null;
  }
  const currentIndex = Math.max(
    visibleFaqs.findIndex(item => item.id === currentFaqId),
    0
  );
  if (key === 'Home') return visibleFaqs[0].id;
  if (key === 'End') return visibleFaqs[visibleFaqs.length - 1].id;
  if (key === 'ArrowDown') return visibleFaqs[(currentIndex + 1) % visibleFaqs.length].id;
  return visibleFaqs[(currentIndex - 1 + visibleFaqs.length) % visibleFaqs.length].id;
}
