const {
  normalizeTrafficSourceRules,
  matchesTrafficSourceRules,
  matchesLegacyTrafficSource,
  summarizeTrafficSourceRules,
} = require('../trafficSourceRules');

describe('trafficSourceRules', () => {
  describe('normalizeTrafficSourceRules', () => {
    it('keeps valid include and exclude rules', () => {
      expect(
        normalizeTrafficSourceRules([
          { type: 'include', value: 'paid_search' },
          { type: 'exclude', value: 'direct' },
        ])
      ).toEqual([
        { type: 'include', value: 'paid_search' },
        { type: 'exclude', value: 'direct' },
      ]);
    });

    it('drops invalid values and all', () => {
      expect(
        normalizeTrafficSourceRules([
          { type: 'include', value: 'all' },
          { type: 'include', value: 'not_real' },
          { type: 'include', value: 'instagram' },
        ])
      ).toEqual([{ type: 'include', value: 'instagram' }]);
    });
  });

  describe('matchesTrafficSourceRules', () => {
    it('requires a include match when include rules exist', () => {
      const rules = [
        { type: 'include', value: 'paid_search' },
        { type: 'include', value: 'email' },
      ];
      expect(matchesTrafficSourceRules(rules, 'paid_search')).toBe(true);
      expect(matchesTrafficSourceRules(rules, 'direct')).toBe(false);
    });

    it('applies exclude rules before include rules', () => {
      const rules = [
        { type: 'include', value: 'organic' },
        { type: 'exclude', value: 'direct' },
      ];
      expect(matchesTrafficSourceRules(rules, 'organic_search')).toBe(true);
      expect(matchesTrafficSourceRules(rules, 'direct')).toBe(false);
    });

    it('allows all sources when only exclude rules are configured', () => {
      const rules = [{ type: 'exclude', value: 'direct' }];
      expect(matchesTrafficSourceRules(rules, 'email')).toBe(true);
      expect(matchesTrafficSourceRules(rules, 'direct')).toBe(false);
    });

    it('expands legacy group values', () => {
      const rules = [{ type: 'include', value: 'social' }];
      expect(matchesTrafficSourceRules(rules, 'instagram')).toBe(true);
      expect(matchesTrafficSourceRules(rules, 'paid_search')).toBe(false);
    });
  });

  describe('matchesLegacyTrafficSource', () => {
    it('keeps legacy broad traffic source filters compatible with detailed sources', () => {
      expect(matchesLegacyTrafficSource('social', 'instagram')).toBe(true);
      expect(matchesLegacyTrafficSource('social', 'paid_search')).toBe(false);
    });
  });

  describe('summarizeTrafficSourceRules', () => {
    it('summarizes include and exclude lists', () => {
      expect(
        summarizeTrafficSourceRules([
          { type: 'include', value: 'paid_search' },
          { type: 'exclude', value: 'direct' },
        ])
      ).toBe('include paid search · exclude direct');
    });
  });
});
