import { buildTargetingSummary } from '../targetingSummary';
import { HOMEPAGE_URL_PATTERN_SHOPIFY } from '../wizardCheckoutConstants';

describe('buildTargetingSummary', () => {
  it('builds storefront at-a-glance and rail sections for embedded Shopify tests', () => {
    const summary = buildTargetingSummary({
      formData: {
        holdout_percent: 10,
        segments: {
          url_pattern: '/products/',
          device: 'mobile',
          customer: 'new',
          countries: ['US'],
        },
      },
      isStandalone: false,
      countriesSummary: 'United States of America (US)',
    });

    expect(summary.atAGlance).toBe(
      'Products · Mobile · New · United States of America (US) · 10% holdout'
    );
    expect(summary.railSections.map(section => section.id)).toEqual([
      'page',
      'audience',
      'holdout',
      'advanced',
    ]);
    expect(summary.railSections[0]).toMatchObject({
      label: 'Page',
      detail: 'Products',
      showActivityDot: false,
    });
    expect(summary.railSections[2]).toMatchObject({
      label: 'Holdout',
      detail: '10% reserved',
      showActivityDot: true,
    });
  });

  it('omits audience from standalone summaries and rail sections', () => {
    const summary = buildTargetingSummary({
      formData: {
        holdout_percent: 0,
        segments: {
          url_pattern: HOMEPAGE_URL_PATTERN_SHOPIFY,
        },
      },
      isStandalone: true,
    });

    expect(summary.atAGlance).toBe('Homepage · 0% holdout');
    expect(summary.railSections.map(section => section.id)).toEqual([
      'page',
      'holdout',
      'advanced',
    ]);
  });

  it('summarizes shipping qualification without audience in the at-a-glance line', () => {
    const summary = buildTargetingSummary({
      formData: {
        holdout_percent: 25,
        segments: {},
      },
      isShippingTestType: true,
      isShippingStorewideAdvanced: false,
      selectedScopeProductCount: 2,
      excludedScopeProductCount: 1,
    });

    expect(summary.atAGlance).toBe('2 included products · 1 excluded · 25% holdout');
    expect(summary.railSections[0]).toMatchObject({
      label: 'Qualification',
      detail: '2 included products · 1 excluded',
    });
  });

  it('includes checkout scope and audience in checkout summaries', () => {
    const summary = buildTargetingSummary({
      formData: {
        holdout_percent: 10,
        segments: {
          device: 'desktop',
          customer: 'all',
        },
      },
      isCheckoutTestType: true,
    });

    expect(summary.atAGlance).toBe('Checkout only · Desktop · 10% holdout');
    expect(summary.railSections[0]).toMatchObject({
      id: 'page',
      label: 'Checkout scope',
      detail: 'Checkout only',
    });
    expect(summary.railSections.map(section => section.id)).toEqual([
      'page',
      'audience',
      'holdout',
      'advanced',
    ]);
  });

  it('keeps standard audience filters visible when custom rules are configured', () => {
    const summary = buildTargetingSummary({
      formData: {
        holdout_percent: 0,
        segments: {
          device: 'mobile',
          customer: 'all',
          countries: ['US'],
          custom_rules: [
            { field: 'utm_source', operator: 'equals', value: 'google' },
            { field: 'country', operator: 'equals', value: 'US' },
          ],
        },
      },
      countriesSummary: 'United States of America (US)',
    });

    expect(summary.railSections[1]).toMatchObject({
      id: 'audience',
      detail: 'Mobile · United States of America (US) + 2 AND conditions',
      showActivityDot: true,
    });
    expect(summary.atAGlance).toContain(
      'Mobile · United States of America (US) + 2 AND conditions'
    );
  });
});
