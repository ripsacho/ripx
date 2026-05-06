const {
  FAQ_ALL_CATEGORY,
  buildFaqSuggestions,
  filterFaqs,
  scoreFaqForContext,
} = require('../supportFaqService');

describe('supportFaqService', () => {
  test('filters FAQ cards by query and category', () => {
    const results = filterFaqs({ query: 'checkout', category: 'Checkout' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('checkout');
  });

  test('scores route context above unrelated FAQ cards', () => {
    const analyticsScore = scoreFaqForContext(
      { category: 'Analytics', question: 'Analytics', tags: [], routes: ['analytics'] },
      { pathname: '/app/demo/analytics' }
    );
    const setupScore = scoreFaqForContext(
      { category: 'Setup', question: 'Setup', tags: [], routes: ['setup'] },
      { pathname: '/app/demo/analytics' }
    );

    expect(analyticsScore).toBeGreaterThan(setupScore);
  });

  test('builds contextual suggestions and only invokes KB fallback when needed', async () => {
    const retrieveKbContext = jest.fn().mockResolvedValue({ status: 'ok', sources: ['kb.md'] });

    const contextual = await buildFaqSuggestions({
      pathname: '/app/demo/analytics',
      category: FAQ_ALL_CATEGORY,
      limit: 4,
      retrieveKbContext,
    });
    const noCuratedMatch = await buildFaqSuggestions({
      query: 'unmatched custom phrase',
      limit: 3,
      retrieveKbContext,
    });

    expect(contextual.suggestions.map(item => item.id)).toContain('analytics');
    expect(noCuratedMatch.kb.status).toBe('ok');
    expect(retrieveKbContext).toHaveBeenCalledTimes(1);
  });
});
