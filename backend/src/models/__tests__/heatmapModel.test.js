jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

const { query } = require('../../utils/database');
const heatmap = require('../heatmap');

describe('heatmap model reporting', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('normalizes heatmap page URLs into stable page keys', () => {
    expect(heatmap.normalizeHeatmapPageKey('https://shop.test/products/a?utm=x#reviews')).toBe(
      '/products/a'
    );
    expect(heatmap.normalizeHeatmapPageKey('https://shop.test/products/a/?utm=x#reviews')).toBe(
      '/products/a'
    );
    expect(heatmap.normalizeHeatmapPageKey('/collections/summer?page=2')).toBe(
      '/collections/summer'
    );
    expect(heatmap.normalizeHeatmapPageKey('')).toBe('/');
  });

  it('normalizes stored page URLs to privacy-safe page paths', () => {
    expect(
      heatmap.normalizeHeatmapStoredPageUrl('https://shop.test/products/a?email=a@test.com')
    ).toBe('/products/a');
    expect(heatmap.normalizeHeatmapStoredPageUrl('/cart?discount=SECRET')).toBe('/cart');
  });

  it('normalizes heatmap segment values safely', () => {
    expect(heatmap.normalizeHeatmapSegmentValue(' US ', 8)).toBe('us');
    expect(heatmap.normalizeHeatmapSegmentValue('bad value', 8)).toBeNull();
    expect(heatmap.normalizeHeatmapSegmentValue('toolong', 3)).toBeNull();
  });

  it('normalizes overlay coordinates from legacy viewport percentages', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          x_norm: 640,
          y_norm: 360,
          count: '4',
          reference_width: '1280',
          reference_height: '720',
          scoped_count: '4',
          full_count: '0',
          legacy_count: '4',
          min_page_width: null,
          max_page_width: null,
          min_page_height: null,
          max_page_height: null,
        },
      ],
    });

    const result = await heatmap.getClickHeatmapForOverlay('test-1', 'shop.myshopify.com', '/pdp');

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('page_x IS NOT NULL');
    expect(query.mock.calls[0][0]).toContain(
      'FLOOR((scoped.x::numeric / 100) * stats.reference_width)'
    );
    expect(result).toEqual({
      points: [{ x: 640, y: 360, count: 4 }],
      referenceWidth: 1280,
      referenceHeight: 720,
      overlayMode: 'legacy-viewport',
      fullPagePointCount: 0,
      legacyPointCount: 4,
      skippedPointCount: 0,
      quality: {
        overlayMode: 'legacy-viewport',
        fullPagePointCount: 0,
        legacyPointCount: 4,
        skippedPointCount: 0,
        referenceDimensionStrategy: 'legacy-reference-viewport',
        pageWidthRange: { min: null, max: null },
        pageHeightRange: { min: null, max: null },
        dimensionMismatch: false,
      },
    });
  });

  it('uses full-page dimensions when overlay rows include document coordinates', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          x_norm: 320,
          y_norm: 1800,
          count: '3',
          reference_width: '1440',
          reference_height: '4200',
          scoped_count: '3',
          full_count: '3',
          legacy_count: '0',
          min_page_width: '1440',
          max_page_width: '1440',
          min_page_height: '4200',
          max_page_height: '4200',
        },
      ],
    });

    const result = await heatmap.getClickHeatmapForOverlay('test-1', 'shop.myshopify.com', '/pdp');

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('percentile_disc(0.5)');
    expect(query.mock.calls[0][0]).toContain('scoped.page_y::numeric / scoped.page_height');
    expect(result).toEqual({
      points: [{ x: 320, y: 1800, count: 3 }],
      referenceWidth: 1440,
      referenceHeight: 4200,
      overlayMode: 'full-page',
      fullPagePointCount: 3,
      legacyPointCount: 0,
      skippedPointCount: 0,
      quality: {
        overlayMode: 'full-page',
        fullPagePointCount: 3,
        legacyPointCount: 0,
        skippedPointCount: 0,
        referenceDimensionStrategy: 'median-captured-document',
        pageWidthRange: { min: 1440, max: 1440 },
        pageHeightRange: { min: 4200, max: 4200 },
        dimensionMismatch: false,
      },
    });
  });

  it('clamps click grid buckets and ignores null coordinates', async () => {
    query.mockResolvedValueOnce({
      rows: [{ variant_id: 'variant-a', x_bucket: 9, y_bucket: 9, count: '2' }],
    });

    const result = await heatmap.getClickHeatmap('test-1', 'shop.myshopify.com', null, {
      variantId: 'variant-a',
      since: '2026-05-01',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('x IS NOT NULL AND y IS NOT NULL');
    expect(query.mock.calls[0][0]).toContain('LOWER(TRIM(shop_domain)) = LOWER(TRIM($2))');
    expect(query.mock.calls[0][0]).toContain('LEAST(9, GREATEST(0, FLOOR(x::numeric / 10)::int))');
    expect(query.mock.calls[0][0]).toContain('LEAST(9, GREATEST(0, FLOOR(y::numeric / 10)::int))');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'click',
      'variant-a',
      '2026-05-01',
    ]);
    expect(result).toEqual([{ variant_id: 'variant-a', x_bucket: 9, y_bucket: 9, count: '2' }]);
  });

  it('returns heatmap page stats scoped by variant and date', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          page_key: '/products/a',
          page_url: 'https://shop.test/products/a?utm=x',
          count: '12',
          click_count: '8',
          scroll_count: '4',
          variant_count: '2',
          first_seen: '2026-05-01T00:00:00.000Z',
          last_seen: '2026-05-02T00:00:00.000Z',
        },
      ],
    });

    const result = await heatmap.getHeatmapPages('test-1', 'shop.myshopify.com', {
      variantId: 'variant-a',
      since: '2026-05-01',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('page_key');
    expect(query.mock.calls[0][0]).toContain('GROUP BY CASE WHEN COALESCE(page_key');
    expect(query.mock.calls[0][0]).toContain('ORDER BY count DESC');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'variant-a',
      '2026-05-01',
    ]);
    expect(result).toEqual([
      {
        page_key: '/products/a',
        page_url: 'https://shop.test/products/a?utm=x',
        count: 12,
        click_count: 8,
        scroll_count: 4,
        variant_count: 2,
        first_seen: '2026-05-01T00:00:00.000Z',
        last_seen: '2026-05-02T00:00:00.000Z',
      },
    ]);
  });

  it('returns collection stats for the active heatmap scope', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          total_events: '30',
          click_events: '18',
          scroll_events: '12',
          page_count: '3',
          variant_count: '2',
          device_count: '2',
          country_count: '1',
          first_seen: '2026-05-01T00:00:00.000Z',
          last_seen: '2026-05-02T00:00:00.000Z',
          avg_viewport_width: '1280',
          avg_viewport_height: '720',
        },
      ],
    });

    const result = await heatmap.getHeatmapCollectionStats('test-1', ' Shop.MyShopify.com ', {
      pageKey: '/products/a/',
      device: ' Mobile ',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('COUNT(*) FILTER (WHERE event_type =');
    expect(query.mock.calls[0][0]).toContain('COUNT(DISTINCT');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      '/products/a',
      'mobile',
    ]);
    expect(result).toEqual({
      totalEvents: 30,
      clickEvents: 18,
      scrollEvents: 12,
      pageCount: 3,
      variantCount: 2,
      deviceCount: 2,
      countryCount: 1,
      firstSeen: '2026-05-01T00:00:00.000Z',
      lastSeen: '2026-05-02T00:00:00.000Z',
      avgViewportWidth: 1280,
      avgViewportHeight: 720,
    });
  });

  it('applies page and segment filters consistently to heatmap read paths', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const opts = {
      pageKey: 'https://shop.test/products/a?utm=1',
      variantId: 'variant-a',
      since: '2026-05-01',
      device: ' Mobile ',
      country: ' US ',
    };

    await heatmap.getClickHeatmap('test-1', ' Shop.MyShopify.com ', null, opts);
    await heatmap.getScrollHeatmap('test-1', ' Shop.MyShopify.com ', null, opts);
    await heatmap.getClickHeatmapForOverlay('test-1', ' Shop.MyShopify.com ', null, opts);
    await heatmap.getHeatmapPages('test-1', ' Shop.MyShopify.com ', {
      variantId: 'variant-a',
      since: '2026-05-01',
      device: ' Mobile ',
      country: ' US ',
    });

    expect(query.mock.calls[0][0]).toContain('device = $7');
    expect(query.mock.calls[0][0]).toContain('country = $8');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'click',
      '/products/a',
      'variant-a',
      '2026-05-01',
      'mobile',
      'us',
    ]);
    expect(query.mock.calls[1][0]).toContain('device = $7');
    expect(query.mock.calls[1][0]).toContain('country = $8');
    expect(query.mock.calls[2][0]).toContain('device = $7');
    expect(query.mock.calls[2][0]).toContain('country = $8');
    expect(query.mock.calls[3][0]).toContain('device = $5');
    expect(query.mock.calls[3][0]).toContain('country = $6');
    expect(query.mock.calls[3][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'variant-a',
      '2026-05-01',
      'mobile',
      'us',
    ]);
  });

  it('normalizes page key and segment values when inserting heatmap batches', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await heatmap.insertHeatmapEventsBatch([
      {
        test_id: 'test-1',
        variant_id: 'control',
        shop_domain: ' Shop.MyShopify.com ',
        page_url: 'https://shop.test/products/a?utm=1',
        event_type: 'click',
        x: 50,
        y: 20,
        device: ' Mobile ',
        country: ' US ',
        capture_version: 'full-page-v2',
        page_height_source: 'Document',
        scroll_container_detected: true,
      },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('page_x, page_y, page_width, page_height');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'control',
      'shop.myshopify.com',
      '/products/a',
      'click',
      50,
      20,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '/products/a',
      'mobile',
      'us',
      'full-page-v2',
      'document',
      true,
    ]);
    expect(result).toEqual({ inserted: 1 });
  });

  it('returns heatmap-native segment options for the selected scope', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { segment_type: 'device', value: 'mobile', count: '14', last_seen: '2026-05-02' },
        { segment_type: 'country', value: 'us', count: '9', last_seen: '2026-05-01' },
      ],
    });

    const result = await heatmap.getHeatmapSegmentOptions('test-1', ' Shop.MyShopify.com ', {
      pageKey: '/products/a?utm=1',
      variantId: 'variant-a',
      since: '2026-05-01',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("SELECT 'device' as segment_type");
    expect(query.mock.calls[0][0]).toContain("SELECT 'country' as segment_type");
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      '/products/a',
      'variant-a',
      '2026-05-01',
    ]);
    expect(result).toEqual({
      devices: [{ value: 'mobile', count: 14, lastSeen: '2026-05-02' }],
      countries: [{ value: 'us', count: 9, lastSeen: '2026-05-01' }],
    });
  });

  it('reads heatmap daily rollup summaries when available', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          total_events: '25',
          click_events: '15',
          scroll_events: '10',
          page_count: '2',
          variant_count: '2',
          device_count: '1',
          country_count: '1',
          first_date: '2026-05-01',
          last_date: '2026-05-02',
          last_seen_at: '2026-05-02T10:00:00.000Z',
          rollup_rows: '3',
        },
      ],
    });

    const result = await heatmap.getHeatmapRollupSummary('test-1', ' Shop.MyShopify.com ', {
      pageKey: '/products/a/',
      device: ' Mobile ',
      country: ' US ',
      since: '2026-05-01',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FROM heatmap_event_daily_rollups');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      '/products/a',
      '2026-05-01',
      'mobile',
      'us',
    ]);
    expect(result).toEqual({
      available: true,
      populated: true,
      source: 'heatmap_event_daily_rollups',
      rollupRows: 3,
      totalEvents: 25,
      clickEvents: 15,
      scrollEvents: 10,
      pageCount: 2,
      variantCount: 2,
      deviceCount: 1,
      countryCount: 1,
      firstDate: '2026-05-01',
      lastDate: '2026-05-02',
      lastSeenAt: '2026-05-02T10:00:00.000Z',
    });
  });
});
