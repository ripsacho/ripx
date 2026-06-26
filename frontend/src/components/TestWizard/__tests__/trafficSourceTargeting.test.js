import {
  createEmptyTrafficSourceRule,
  hydrateTrafficSourceSegments,
  normalizeTrafficSourceRules,
  syncTrafficSourceSegments,
  summarizeTrafficSourceRules,
  validateTrafficSourceRules,
} from '../trafficSourceTargeting';

describe('trafficSourceTargeting', () => {
  it('creates empty include rules with a default source', () => {
    expect(createEmptyTrafficSourceRule()).toEqual({ type: 'include', value: 'direct' });
  });

  it('hydrates legacy single traffic_source into include rules', () => {
    expect(
      hydrateTrafficSourceSegments({
        traffic_source: 'instagram',
      })
    ).toEqual({
      traffic_source: 'all',
      traffic_source_rules: [{ type: 'include', value: 'instagram' }],
    });
  });

  it('syncs rules and clears legacy traffic_source', () => {
    expect(
      syncTrafficSourceSegments({ traffic_source: 'email' }, [{ type: 'exclude', value: 'direct' }])
    ).toEqual({
      traffic_source: 'all',
      traffic_source_rules: [{ type: 'exclude', value: 'direct' }],
    });
  });

  it('summarizes rules with friendly labels', () => {
    expect(
      summarizeTrafficSourceRules([
        { type: 'include', value: 'paid_search' },
        { type: 'exclude', value: 'direct' },
      ])
    ).toBe('Include Paid Search · Exclude Direct');
  });

  it('flags duplicate rules during validation', () => {
    const rules = normalizeTrafficSourceRules([
      { type: 'include', value: 'email' },
      { type: 'include', value: 'email' },
    ]);
    expect(validateTrafficSourceRules(rules)).toEqual([
      'Source site rule 2 duplicates another rule.',
    ]);
  });
});
