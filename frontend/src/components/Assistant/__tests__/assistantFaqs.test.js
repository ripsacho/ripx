import {
  ASSISTANT_FAQS,
  FAQ_ALL_CATEGORY,
  addRecentFaqId,
  buildFaqAgentPrompt,
  buildNoResultAgentPrompt,
  buildFaqSupportMessage,
  filterFaqs,
  getFaqCategories,
  getNextFaqIdForKey,
  getRecommendedFaqs,
  normalizeRecentFaqIds,
  resolveSelectedFaq,
} from '../assistantFaqs';

describe('assistant FAQ helpers', () => {
  it('filters FAQs by query, category, and tags', () => {
    const results = filterFaqs({ query: 'srm', category: 'Testing' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('traffic');
  });

  it('returns all FAQ categories with the All category first', () => {
    const categories = getFaqCategories();

    expect(categories[0]).toBe(FAQ_ALL_CATEGORY);
    expect(categories).toContain('Analytics');
    expect(categories).toContain('Checkout');
  });

  it('resolves selected FAQ to the first visible result after filtering', () => {
    const visibleFaqs = filterFaqs({ query: 'checkout', category: 'Checkout' });
    const selected = resolveSelectedFaq({ visibleFaqs, selectedFaqId: 'traffic' });

    expect(selected.id).toBe('checkout');
  });

  it('recommends FAQs from route context before falling back to the default list', () => {
    const analyticsResults = getRecommendedFaqs({ pathname: '/app/example/analytics/details' });
    const fallbackResults = getRecommendedFaqs({ pathname: '/unknown' });

    expect(analyticsResults.map(item => item.id)).toContain('analytics');
    expect(fallbackResults[0].id).toBe(ASSISTANT_FAQS[0].id);
  });

  it('keeps recent FAQ ids unique and known', () => {
    const recentIds = normalizeRecentFaqIds(['traffic', 'missing', 'traffic', 'connect']);
    const nextIds = addRecentFaqId(recentIds, 'analytics');

    expect(recentIds).toEqual(['traffic', 'connect']);
    expect(nextIds).toEqual(['analytics', 'traffic', 'connect']);
  });

  it('builds Agent and CustomerSupport handoff payloads with FAQ and page context', () => {
    const faq = ASSISTANT_FAQS.find(item => item.id === 'analytics');
    const context = {
      pathname: '/app/demo/analytics',
      search: 'numbers',
    };

    expect(buildFaqAgentPrompt(faq, context)).toContain('FAQ category: Analytics');
    expect(buildFaqAgentPrompt(faq, context)).toContain('Current page: /app/demo/analytics');
    expect(buildFaqSupportMessage(faq, context)).toContain('Search query: numbers');
    expect(buildFaqSupportMessage(faq, context)).toContain(faq.question);
  });

  it('builds no-result escalation prompt with search and page context', () => {
    const prompt = buildNoResultAgentPrompt('unknown checkout blocker', {
      pathname: '/app/demo/settings',
    });

    expect(prompt).toContain('could not find a matching FAQ');
    expect(prompt).toContain('User search: unknown checkout blocker');
    expect(prompt).toContain('Current page: /app/demo/settings');
  });

  it('supports keyboard-friendly FAQ list navigation', () => {
    const visibleFaqs = ASSISTANT_FAQS.slice(0, 3);

    expect(
      getNextFaqIdForKey({ visibleFaqs, currentFaqId: visibleFaqs[0].id, key: 'ArrowDown' })
    ).toBe(visibleFaqs[1].id);
    expect(
      getNextFaqIdForKey({ visibleFaqs, currentFaqId: visibleFaqs[0].id, key: 'ArrowUp' })
    ).toBe(visibleFaqs[2].id);
    expect(getNextFaqIdForKey({ visibleFaqs, currentFaqId: visibleFaqs[1].id, key: 'Home' })).toBe(
      visibleFaqs[0].id
    );
    expect(getNextFaqIdForKey({ visibleFaqs, currentFaqId: visibleFaqs[1].id, key: 'End' })).toBe(
      visibleFaqs[2].id
    );
    expect(getNextFaqIdForKey({ visibleFaqs, currentFaqId: visibleFaqs[1].id, key: 'Enter' })).toBe(
      visibleFaqs[1].id
    );
  });
});
