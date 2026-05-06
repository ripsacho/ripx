import {
  getDefinitionHealth,
  getUnknownSearchPrefixes,
  matchesSearchQuery,
  needsAttention,
  normalizeEventName,
} from '../goalMetricsUtils';

const triggerLabels = {
  custom_event: 'Manual custom event',
  css_click: 'CSS click',
  element_visibility: 'Element visibility',
};

describe('goalMetricsUtils', () => {
  const baseDefinition = {
    name: 'Checkout CTA Click',
    event_name: 'checkout_cta_click',
    description: 'Tracks checkout clicks',
    category: 'conversion',
    metric_role: 'secondary',
    trigger_type: 'css_click',
    builtin: false,
    tags: ['checkout', 'lead'],
    observed_count: 0,
  };

  it('normalizes event names for reusable keys', () => {
    expect(normalizeEventName('  Checkout CTA Click!!  ')).toBe('checkout_cta_click');
    expect(normalizeEventName('__Already_Clean__')).toBe('already_clean');
  });

  it('matches scoped advanced search prefixes', () => {
    const query = 'tag:lead trigger:css role:secondary';

    expect(matchesSearchQuery(baseDefinition, query, triggerLabels)).toBe(true);
    expect(matchesSearchQuery(baseDefinition, 'source:builtin', triggerLabels)).toBe(false);
  });

  it('keeps unknown prefixes as plain text and reports them for UI feedback', () => {
    expect(getUnknownSearchPrefixes('owner:ripon tag:lead owner:team')).toEqual(['owner']);
    expect(matchesSearchQuery(baseDefinition, 'owner:ripon', triggerLabels)).toBe(false);
  });

  it('marks only custom unobserved definitions as needing attention', () => {
    expect(needsAttention(baseDefinition)).toBe(true);
    expect(needsAttention({ ...baseDefinition, observed_count: 4 })).toBe(false);
    expect(needsAttention({ ...baseDefinition, builtin: true })).toBe(false);
  });

  it('returns actionable health labels', () => {
    expect(getDefinitionHealth({ ...baseDefinition, builtin: true })).toEqual({
      label: 'Ready',
      tone: 'info',
    });
    expect(getDefinitionHealth({ ...baseDefinition, observed_count: 2 })).toEqual({
      label: 'Observed',
      tone: 'success',
    });
    expect(getDefinitionHealth(baseDefinition)).toEqual({
      label: 'Auto armed',
      tone: 'attention',
    });
  });
});
