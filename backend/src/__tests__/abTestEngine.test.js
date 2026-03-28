/**
 * Unit tests for AB Test Engine
 */

const ABTestEngine = require('../services/abTestEngine');

describe('ABTestEngine.selectVariant', () => {
  const variants = [
    { id: 'v1', name: 'Control', allocation: 50, config: {} },
    { id: 'v2', name: 'Variant A', allocation: 50, config: {} },
  ];

  it('returns same variant for same userId (deterministic)', () => {
    const result1 = ABTestEngine.selectVariant(variants, 'user-123');
    const result2 = ABTestEngine.selectVariant(variants, 'user-123');
    expect(result1).toEqual(result2);
  });

  it('returns holdout when user falls in holdout bucket', () => {
    const result = ABTestEngine.selectVariant(variants, 'user-123', 100);
    expect(result.name).toBe('Holdout');
    expect(result.id).toBe('holdout');
  });

  it('returns holdout when user falls in partial holdout', () => {
    const result = ABTestEngine.selectVariant(variants, 'user-00000000', 50);
    expect(result.name).toBe('Holdout');
  });

  it('returns one of the variants for 50/50 split', () => {
    const result = ABTestEngine.selectVariant(variants, 'user-xyz-789');
    expect(['Control', 'Variant A']).toContain(result.name);
  });

  it('returns last variant when cumulative edge case', () => {
    const twoVariants = [
      { id: 'a', name: 'A', allocation: 50, config: {} },
      { id: 'b', name: 'B', allocation: 50, config: {} },
    ];
    const result = ABTestEngine.selectVariant(twoVariants, 'user-deterministic');
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });
});

describe('ABTestEngine.isUserEligible', () => {
  it('returns true when segments are all or empty', () => {
    const test = { segments: {} };
    expect(ABTestEngine.isUserEligible(test, {})).toBe(true);
    expect(ABTestEngine.isUserEligible(test, { device: 'mobile' })).toBe(true);
  });

  it('returns false when device does not match', () => {
    const test = { segments: { device: 'mobile' } };
    expect(ABTestEngine.isUserEligible(test, { device: 'desktop' })).toBe(false);
  });

  it('returns true when device matches', () => {
    const test = { segments: { device: 'mobile' } };
    expect(ABTestEngine.isUserEligible(test, { device: 'mobile' })).toBe(true);
  });

  it('returns false when country not in list', () => {
    const test = { segments: { countries: ['US', 'CA'] } };
    expect(ABTestEngine.isUserEligible(test, { country: 'BD' })).toBe(false);
  });

  it('returns true when country in list', () => {
    const test = { segments: { countries: ['US', 'BD'] } };
    expect(ABTestEngine.isUserEligible(test, { country: 'BD' })).toBe(true);
  });

  it('ignores legacy url_pattern for price tests in all-products scope', () => {
    const test = {
      type: 'price',
      target_type: 'all-products',
      segments: { url_pattern: '/products/' },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/collections/snowboards',
        current_pathname: '/collections/snowboards',
      })
    ).toBe(true);
  });

  it('still enforces url_pattern for non-price tests', () => {
    const test = {
      type: 'content',
      target_type: 'homepage',
      segments: { url_pattern: '^/products/' },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/collections/snowboards',
        current_pathname: '/collections/snowboards',
      })
    ).toBe(false);
  });

  it('still enforces explicit page_rules for price tests', () => {
    const test = {
      type: 'price',
      target_type: 'all-products',
      segments: {
        page_rules: [{ type: 'include', match_type: 'starts_with', pattern: '/products/' }],
      },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/collections/snowboards',
        current_pathname: '/collections/snowboards',
      })
    ).toBe(false);
  });
});
