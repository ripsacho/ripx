import {
  describeCustomAudienceGroupsLogic,
  describeCustomRule,
  describeCustomRulesLogic,
  duplicateCustomRuleAt,
  evaluateCustomRulesDetailed,
  exportLegacyCustomRules,
  getCustomRuleWarnings,
  getCustomRuleOperatorHint,
  getCustomRulePreviewFieldHint,
  matchesCustomAudienceRuleGroups,
  matchesCustomAudienceRules,
  moveCustomRuleAt,
  normalizeCustomRuleGroups,
  normalizeCustomRules,
  resolveCustomRuleGroupsFromSegments,
  summarizeCustomRuleGroups,
  summarizeCustomRules,
  summarizeAudienceTargeting,
  summarizeStandardAudienceSegments,
  syncSegmentsCustomAudience,
  validateCustomRuleGroups,
  validateCustomRules,
} from '../customAudienceRules';

describe('customAudienceRules', () => {
  it('normalizes list operators and drops empty values', () => {
    expect(
      normalizeCustomRules([
        { field: 'country', operator: 'in', value: 'US, ca ' },
        { field: 'utm_source', operator: 'equals', value: '   ' },
      ])
    ).toEqual([{ field: 'country', operator: 'in', value: ['US', 'ca'] }]);
  });

  it('validates country codes and regex patterns', () => {
    expect(
      validateCustomRules([
        { field: 'country', operator: 'equals', value: 'USA' },
        { field: 'current_url', operator: 'regex', value: '[' },
      ])
    ).toEqual([
      'Custom audience rule 1: country codes must be two letters (for example US, GB).',
      'Custom audience rule 2: regex pattern is invalid.',
    ]);
  });

  it('evaluates AND-combined rules against sample context', () => {
    const rules = [
      { field: 'device', operator: 'equals', value: 'desktop' },
      { field: 'utm_medium', operator: 'equals', value: 'email' },
    ];
    expect(
      matchesCustomAudienceRules(rules, {
        device: 'desktop',
        utm_medium: 'email',
      })
    ).toBe(true);
    expect(
      matchesCustomAudienceRules(rules, {
        device: 'mobile',
        utm_medium: 'email',
      })
    ).toBe(false);
  });

  it('evaluates OR groups and AND-combined groups together', () => {
    const groups = [
      {
        match: 'any',
        rules: [
          { field: 'utm_medium', operator: 'equals', value: 'email' },
          { field: 'traffic_source', operator: 'equals', value: 'paid_social' },
        ],
      },
      {
        match: 'all',
        rules: [{ field: 'device', operator: 'equals', value: 'desktop' }],
      },
    ];
    expect(
      matchesCustomAudienceRuleGroups(groups, {
        utm_medium: 'email',
        device: 'desktop',
      })
    ).toBe(true);
    expect(
      matchesCustomAudienceRuleGroups(groups, {
        traffic_source: 'paid_social',
        device: 'desktop',
      })
    ).toBe(true);
    expect(
      matchesCustomAudienceRuleGroups(groups, {
        utm_medium: 'email',
        device: 'mobile',
      })
    ).toBe(false);
  });

  it('resolves legacy flat custom rules into a single AND group', () => {
    expect(
      resolveCustomRuleGroupsFromSegments({
        custom_rules: [{ field: 'utm_source', operator: 'equals', value: 'google' }],
      })
    ).toEqual([
      {
        match: 'all',
        rules: [{ field: 'utm_source', operator: 'equals', value: 'google' }],
      },
    ]);
  });

  it('syncs grouped storage and legacy custom_rules for single AND groups', () => {
    const groups = [
      {
        match: 'all',
        rules: [{ field: 'country', operator: 'equals', value: 'US' }],
      },
    ];
    expect(exportLegacyCustomRules(groups)).toEqual(groups[0].rules);
    expect(syncSegmentsCustomAudience({}, groups)).toEqual({
      custom_rule_groups: groups,
      custom_rules: groups[0].rules,
    });
    expect(exportLegacyCustomRules(normalizeCustomRuleGroups(groups))).toEqual(groups[0].rules);
  });

  it('summarizes OR groups for targeting summaries', () => {
    expect(
      summarizeCustomRuleGroups([
        {
          match: 'any',
          rules: [
            { field: 'utm_medium', operator: 'equals', value: 'email' },
            { field: 'traffic_source', operator: 'equals', value: 'paid_social' },
          ],
        },
      ])
    ).toBe('2 OR conditions');
    expect(
      describeCustomAudienceGroupsLogic([
        {
          match: 'any',
          rules: [
            { field: 'utm_medium', operator: 'equals', value: 'email' },
            { field: 'traffic_source', operator: 'equals', value: 'paid_social' },
          ],
        },
        {
          match: 'all',
          rules: [{ field: 'device', operator: 'equals', value: 'desktop' }],
        },
      ])
    ).toBe(
      '(UTM medium equals email OR Traffic source equals paid_social) AND (Device equals desktop)'
    );
  });

  it('validates OR groups require at least two conditions', () => {
    expect(
      validateCustomRuleGroups([
        {
          match: 'any',
          rules: [{ field: 'utm_medium', operator: 'equals', value: 'email' }],
        },
      ])
    ).toEqual(['Custom audience: add at least two conditions for an OR group.']);
  });

  it('summarizes one or many rules for targeting summaries', () => {
    expect(
      summarizeCustomRules([{ field: 'utm_source', operator: 'equals', value: 'google' }])
    ).toBe(describeCustomRule({ field: 'utm_source', operator: 'equals', value: 'google' }));
    expect(
      summarizeCustomRules([
        { field: 'utm_source', operator: 'equals', value: 'google' },
        { field: 'country', operator: 'equals', value: 'US' },
      ])
    ).toBe('2 AND conditions');
  });

  it('describes AND logic and warns on overlap with standard audience filters', () => {
    const rules = [
      { field: 'device', operator: 'equals', value: 'mobile' },
      { field: 'country', operator: 'equals', value: 'US' },
    ];
    expect(describeCustomRulesLogic(rules)).toContain('Device equals mobile');
    expect(
      getCustomRuleWarnings(rules, {
        device: 'mobile',
        countries: ['US'],
        traffic_source: 'all',
        operating_system: 'all',
      })
    ).toEqual(
      expect.arrayContaining([
        'Standard audience already filters device. A custom device rule may be redundant.',
        'Standard audience already limits countries. Custom country rules stack on top of that list.',
      ])
    );
  });

  it('reorders and duplicates rules without mutating the source array', () => {
    const rules = [
      { field: 'utm_source', operator: 'equals', value: 'google' },
      { field: 'country', operator: 'equals', value: 'US' },
    ];
    expect(moveCustomRuleAt(rules, 1, -1)).toEqual([
      { field: 'country', operator: 'equals', value: 'US' },
      { field: 'utm_source', operator: 'equals', value: 'google' },
    ]);
    expect(duplicateCustomRuleAt(rules, 0)).toEqual([rules[0], { ...rules[0] }, rules[1]]);
    expect(rules).toHaveLength(2);
  });

  it('evaluates each row against sample context for the studio preview', () => {
    const rows = evaluateCustomRulesDetailed(
      [
        { field: 'device', operator: 'equals', value: 'desktop' },
        { field: 'utm_medium', operator: 'equals', value: '' },
      ],
      { device: 'desktop', utm_medium: 'email' }
    );
    expect(rows[0].evaluation.status).toBe('match');
    expect(rows[1].evaluation.status).toBe('incomplete');
  });

  it('summarizes standard audience filters and combines them with custom rules', () => {
    expect(
      summarizeStandardAudienceSegments(
        {
          device: 'mobile',
          customer: 'new',
          countries: ['US'],
          traffic_source: 'paid_search',
          operating_system: 'ios',
        },
        'United States (US)'
      )
    ).toBe('Mobile · New · United States (US) · Paid search · iOS');

    expect(
      summarizeStandardAudienceSegments({
        traffic_source: 'all',
        traffic_source_rules: [
          { type: 'include', value: 'paid_search' },
          { type: 'exclude', value: 'direct' },
        ],
      })
    ).toBe('Include Paid Search · Exclude Direct');

    expect(
      summarizeAudienceTargeting(
        {
          device: 'desktop',
          customer: 'all',
          countries: [],
          custom_rules: [{ field: 'utm_source', operator: 'equals', value: 'google' }],
        },
        ''
      )
    ).toBe('Desktop + UTM source equals google');
  });

  it('exposes operator and preview field hints for tooltips', () => {
    expect(getCustomRuleOperatorHint('in')).toContain('comma-separated');
    expect(getCustomRulePreviewFieldHint('utm_source')).toContain('utm_source');
  });
});
