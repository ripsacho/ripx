const ASSISTANT_FAQS = [
  {
    id: 'connect',
    category: 'Setup',
    question: 'How do I connect a Shopify store?',
    answer:
      'Open Domains, choose the Shopify store, complete the install flow, then verify the app embed/script from App settings > Installation. If the store is still not verified, ask RipX Agent to inspect script and domain readiness.',
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

const FAQ_ALL_CATEGORY = 'All';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function filterFaqs({ faqs = ASSISTANT_FAQS, query = '', category = FAQ_ALL_CATEGORY } = {}) {
  const normalizedQuery = normalizeText(query);
  return faqs.filter(item => {
    const categoryMatches = category === FAQ_ALL_CATEGORY || item.category === category;
    if (!categoryMatches) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return `${item.question} ${item.answer} ${item.category} ${(item.tags || []).join(' ')}`
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function scoreFaqForContext(faq, { pathname = '', query = '', category = FAQ_ALL_CATEGORY } = {}) {
  const routeText = normalizeText(pathname);
  const queryText = normalizeText(query);
  let score = 0;
  if (category !== FAQ_ALL_CATEGORY && faq.category === category) {
    score += 4;
  }
  for (const route of faq.routes || []) {
    if (route && routeText.includes(normalizeText(route))) {
      score += 3;
    }
  }
  for (const tag of faq.tags || []) {
    if (tag && queryText.includes(normalizeText(tag))) {
      score += 2;
    }
  }
  if (queryText && normalizeText(faq.question).includes(queryText)) {
    score += 2;
  }
  return score;
}

async function buildFaqSuggestions({
  pathname = '/',
  query = '',
  category = FAQ_ALL_CATEGORY,
  limit = 3,
  retrieveKbContext,
} = {}) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 3, 8));
  const filtered = filterFaqs({ query, category });
  const scored = filtered
    .map(item => ({ item, score: scoreFaqForContext(item, { pathname, query, category }) }))
    .sort((a, b) => b.score - a.score || a.item.question.localeCompare(b.item.question));
  const suggestions = (scored.length ? scored : ASSISTANT_FAQS.map(item => ({ item, score: 0 })))
    .slice(0, safeLimit)
    .map(row => ({ ...row.item, reason: row.score > 0 ? 'contextual' : 'curated' }));

  let kb = { status: 'not_requested', sources: [] };
  if (retrieveKbContext && query && (filtered.length === 0 || suggestions.length < safeLimit)) {
    const result = await retrieveKbContext(query, { topK: safeLimit - suggestions.length });
    kb = {
      status: result.status,
      sources: result.sources || [],
    };
  }

  return {
    suggestions,
    kb,
  };
}

module.exports = {
  ASSISTANT_FAQS,
  FAQ_ALL_CATEGORY,
  buildFaqSuggestions,
  filterFaqs,
  scoreFaqForContext,
};
