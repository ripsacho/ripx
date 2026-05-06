const trackRoutes = require('../trackRoutes');

describe('track heatmap route helpers', () => {
  const {
    isHeatmapVariantAllowedForTest,
    isValidHeatmapVariantId,
    normalizeHeatmapCaptureEvent,
    parseFiniteHeatmapNumber,
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
