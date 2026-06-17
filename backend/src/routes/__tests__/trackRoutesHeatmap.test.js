const trackRoutes = require('../trackRoutes');

describe('track heatmap route helpers', () => {
  const {
    carrierRequestMatchesAssignment,
    getShippingCarrierCallbackTrace,
    isHeatmapVariantAllowedForTest,
    isValidHeatmapVariantId,
    normalizeShippingCallbackStrategy,
    normalizeHeatmapCaptureEvent,
    parseFiniteHeatmapNumber,
    recordShippingCarrierCallbackTrace,
    summarizeCarrierAssignmentDiagnostics,
  } = trackRoutes.__testUtils;

  it('accepts assignment variant identifiers that are not UUIDs', () => {
    expect(isValidHeatmapVariantId('control')).toBe(true);
    expect(isValidHeatmapVariantId('holdout')).toBe(true);
    expect(isValidHeatmapVariantId('Variant A')).toBe(true);
    expect(isValidHeatmapVariantId('price-test:v2')).toBe(true);
  });

  it('rejects empty, control-character, and oversized variant identifiers', () => {
    expect(isValidHeatmapVariantId('')).toBe(false);
    expect(isValidHeatmapVariantId('   ')).toBe(false);
    expect(isValidHeatmapVariantId('variant\none')).toBe(false);
    expect(isValidHeatmapVariantId('x'.repeat(256))).toBe(false);
  });

  it('only allows heatmap variants that belong to the resolved test', () => {
    const test = {
      variants: [
        { id: 'control', name: 'Control' },
        { id: 'variant-a', name: 'Variant A' },
      ],
    };

    expect(isHeatmapVariantAllowedForTest(test, 'control')).toBe(true);
    expect(isHeatmapVariantAllowedForTest(test, 'Variant A')).toBe(true);
    expect(isHeatmapVariantAllowedForTest(test, 'other-test-variant')).toBe(false);
    expect(isHeatmapVariantAllowedForTest(null, 'control')).toBe(false);
  });

  it('parses only finite heatmap numbers', () => {
    expect(parseFiniteHeatmapNumber('42.5')).toBe(42.5);
    expect(parseFiniteHeatmapNumber('NaN')).toBeNull();
    expect(parseFiniteHeatmapNumber(Infinity)).toBeNull();
    expect(parseFiniteHeatmapNumber('')).toBeNull();
  });

  it('matches carrier callback assignments from line item properties', () => {
    const req = {
      body: {
        rate: {
          items: [
            {
              properties: {
                _ripx_price_test: 'test-1',
                _ripx_variant: 'Variant A',
              },
            },
          ],
        },
      },
    };
    expect(
      carrierRequestMatchesAssignment(req, {
        testId: 'test-1',
        variantId: 'Variant A',
        variantIndex: 1,
      })
    ).toBe(true);
    expect(
      carrierRequestMatchesAssignment(req, {
        testId: 'test-1',
        variantId: 'Variant B',
        variantIndex: 2,
      })
    ).toBe(false);
  });

  it('matches carrier callback assignment by configured variant name alias', () => {
    const req = {
      body: {
        rate: {
          items: [
            {
              properties: {
                _ripx_price_test: 'test-alias',
                _ripx_variant: 'Variant A',
              },
            },
          ],
        },
      },
    };

    expect(
      carrierRequestMatchesAssignment(req, {
        testId: 'test-alias',
        variantId: 'variant-canonical-id',
        variantName: 'Variant A',
      })
    ).toBe(true);
  });

  it('summarizes carrier assignment diagnostics for missing-rate debugging', () => {
    const req = {
      body: {
        rate: {
          items: [
            {
              properties: {
                _ripx_price_test: 'test-diagnostics',
                _ripx_variant: 'Variant Diagnostics',
              },
            },
          ],
        },
      },
    };

    expect(
      summarizeCarrierAssignmentDiagnostics(req, {
        testId: 'test-diagnostics',
        variantId: 'variant-diagnostics-id',
        variantName: 'Variant Diagnostics',
      })
    ).toMatchObject({
      attributes_count: 2,
      ripx_test_values: ['test-diagnostics'],
      ripx_variant_values: ['Variant Diagnostics'],
      expected_test_id: 'test-diagnostics',
      expected_variant_values: ['variant-diagnostics-id', 'Variant Diagnostics'],
    });
  });

  it('normalizes truncated shipping carrier callback strategies', () => {
    expect(normalizeShippingCallbackStrategy('flat_rat')).toBe('flat_rate');
    expect(normalizeShippingCallbackStrategy('carrier_quot')).toBe('carrier_quote');
    expect(normalizeShippingCallbackStrategy('flat_rat', { strategy: 'flat_rate' })).toBe(
      'flat_rate'
    );
    expect(normalizeShippingCallbackStrategy('flat_rat', { strategy: 'carrier_quote' })).toBe(
      'carrier_quote'
    );
  });

  it('matches carrier callback assignments from public line item properties', () => {
    const req = {
      body: {
        rate: {
          items: [
            {
              properties: {
                ripx_price_test: 'test-public',
                ripx_variant: 'Variant Public',
              },
            },
          ],
        },
      },
    };
    expect(
      carrierRequestMatchesAssignment(req, {
        testId: 'test-public',
        variantId: 'Variant Public',
      })
    ).toBe(true);
  });

  it('records recent shipping carrier callback traces', () => {
    recordShippingCarrierCallbackTrace({
      test_id: 'trace-test',
      variant_id: 'Variant Trace',
      strategy: 'flat_rate',
      amount: 44,
      currency: 'USD',
      rates_count: 1,
      assignment_diagnostics: {
        attributes_count: 2,
        ripx_test_values: ['trace-test'],
        ripx_variant_values: ['Variant Trace'],
        expected_test_id: 'trace-test',
        expected_variant_values: ['Variant Trace'],
      },
      request_shape: { has_rate: true },
    });

    const traces = getShippingCarrierCallbackTrace({ testId: 'trace-test', limit: 1 });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      test_id: 'trace-test',
      variant_id: 'Variant Trace',
      strategy: 'flat_rate',
      rates_count: 1,
      assignment_diagnostics: {
        attributes_count: 2,
        ripx_test_values: ['trace-test'],
        ripx_variant_values: ['Variant Trace'],
        expected_test_id: 'trace-test',
        expected_variant_values: ['Variant Trace'],
      },
      request_shape: { has_rate: true },
    });
  });

  it('clamps click coordinates and preserves capture diagnostics', () => {
    const normalized = normalizeHeatmapCaptureEvent(
      {
        test_id: '00000000-0000-4000-8000-000000000001',
        variant_id: 'variant-a',
        page_url: 'https://shop.test/products/a?email=secret@example.com',
        event_type: 'click',
        x: -25,
        y: 125,
        viewport_width: 1440.4,
        viewport_height: 900.2,
        page_x: 999999,
        page_y: -50,
        page_width: 3000,
        page_height: 4200,
        capture_version: 'Full-Page-V2',
        page_height_source: 'Document',
        scroll_container_detected: 'true',
      },
      'shop.myshopify.com'
    );

    expect(normalized.reason).toBeNull();
    expect(normalized.event).toMatchObject({
      page_url: '/products/a',
      x: 0,
      y: 100,
      viewport_width: 1440,
      viewport_height: 900,
      page_x: 3000,
      page_y: 0,
      capture_version: 'Full-Page-V2',
      page_height_source: 'Document',
      scroll_container_detected: true,
    });
  });

  it('rejects malformed click and scroll payloads with no usable coordinates', () => {
    expect(
      normalizeHeatmapCaptureEvent(
        {
          test_id: '00000000-0000-4000-8000-000000000001',
          variant_id: 'variant-a',
          page_url: '/pdp',
          event_type: 'click',
          x: 'NaN',
          y: 'NaN',
          viewport_width: 0,
          viewport_height: 0,
        },
        'shop.myshopify.com'
      )
    ).toEqual({ event: null, reason: 'malformed' });

    expect(
      normalizeHeatmapCaptureEvent(
        {
          test_id: '00000000-0000-4000-8000-000000000001',
          variant_id: 'variant-a',
          page_url: '/pdp',
          event_type: 'scroll',
          scroll_depth: 'not-a-number',
        },
        'shop.myshopify.com'
      )
    ).toEqual({ event: null, reason: 'malformed' });
  });
});
