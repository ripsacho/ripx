jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

const { query } = require('../../utils/database');
const timeSeriesService = require('../timeSeriesService');

describe('timeSeriesService', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('uses analytics_daily for unscoped chart data', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          date: new Date('2026-05-01T00:00:00.000Z'),
          variant_name: 'Control',
          visitors: '10',
          conversions: '2',
          revenue: '50',
          conversion_rate: '20',
        },
      ],
    });

    const result = await timeSeriesService.getChartData('test-1', ' Shop.MyShopify.com ');

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FROM analytics_daily ad');
    expect(query.mock.calls[0][0]).toContain('LOWER(TRIM(t.shop_domain)) = LOWER(TRIM($2))');
    expect(query.mock.calls[0][1]).toEqual(['test-1', 'shop.myshopify.com']);
    expect(result).toEqual([
      expect.objectContaining({
        date: '2026-05-01',
        name: 'May 1',
        Control: expect.objectContaining({
          visitors: '10',
          conversions: '2',
          revenue: 50,
          conversionRate: 20,
          cumulativeVisitors: 10,
          cumulativeConversions: 2,
          cumulativeConversionRate: 20,
        }),
      }),
    ]);
  });

  it('builds segmented rows with assignment, conversion window, and URL filters', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            date: new Date('2026-05-01T00:00:00.000Z'),
            variant_id: 'control',
            variant_name: 'Control',
            visitors: '5',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            date: new Date('2026-05-01T00:00:00.000Z'),
            variant_id: 'control',
            variant_name: 'Control',
            conversions: '2',
            revenue: '10',
          },
        ],
      });

    const rows = await timeSeriesService.getSegmentedChartRows('test-1', ' Shop.MyShopify.com ', {
      device: 'mobile',
      country: 'us',
      start_date: '2026-05-01',
      end_date: '2026-05-08',
      conversionWindowDays: 7,
      conversionUrl: '/thanks,/checkout',
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("(ta.assigned_at AT TIME ZONE 'UTC')::date as date");
    expect(query.mock.calls[0][0]).toContain('ta.device = $3');
    expect(query.mock.calls[0][0]).toContain('ta.country = $4');
    expect(query.mock.calls[1][0]).toContain('ta.device = $3');
    expect(query.mock.calls[1][0]).toContain('ta.country = $4');
    expect(query.mock.calls[1][0]).toContain(
      "e.created_at <= ta.assigned_at + ($7 || ' days')::interval"
    );
    expect(query.mock.calls[1][0]).toContain("(e.metadata->>'conversion_url')::text ILIKE $8");
    expect(query.mock.calls[1][0]).toContain("(e.metadata->>'conversion_url')::text ILIKE $9");
    expect(query.mock.calls[1][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'mobile',
      'us',
      '2026-05-01',
      '2026-05-08',
      7,
      '%/thanks%',
      '%/checkout%',
    ]);
    expect(rows).toEqual([
      {
        date: new Date('2026-05-01T00:00:00.000Z'),
        variant_id: 'control',
        variant_name: 'Control',
        visitors: 5,
        conversions: 2,
        revenue: 10,
        conversion_rate: 40,
      },
    ]);
  });

  it('uses segmented rollup fast path for scoped chart data', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          date: new Date('2026-05-01T00:00:00.000Z'),
          variant_name: 'Control',
          visitors: '8',
          conversions: '2',
          revenue: '20',
          conversion_rate: '25',
        },
      ],
    });

    const result = await timeSeriesService.getChartData('test-1', 'Shop.MyShopify.com', {
      device: 'mobile',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FROM analytics_daily_segments');
    expect(query.mock.calls[0][0]).toContain('device = $3');
    expect(result[0].Control.conversionRate).toBe(25);
  });

  it('falls back to raw segmented rows when rollups are empty', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { date: new Date('2026-05-01T00:00:00.000Z'), variant_id: 'control', visitors: '5' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            date: new Date('2026-05-01T00:00:00.000Z'),
            variant_id: 'control',
            conversions: '1',
            revenue: '10',
          },
        ],
      });

    const result = await timeSeriesService.getChartData('test-1', 'Shop.MyShopify.com', {
      country: 'us',
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain('FROM analytics_daily_segments');
    expect(query.mock.calls[1][0]).toContain('FROM test_assignments ta');
    expect(result[0].control.conversions).toBe(1);
  });

  it('skips segmented rollups when conversion-specific filters are active', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await timeSeriesService.getChartData('test-1', 'Shop.MyShopify.com', {
      conversionWindowDays: 7,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('FROM test_assignments ta');
    expect(query.mock.calls[0][0]).not.toContain('analytics_daily_segments');
  });

  it('refreshes segmented rollups after daily aggregation', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            test_id: 'test-1',
            shop_domain: 'shop.myshopify.com',
            variants: [{ id: 'control', name: 'Control' }],
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ visitors: '3' }] })
      .mockResolvedValueOnce({ rows: [{ conversions: '1', revenue: '10' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ refresh_analytics_daily_segments: 1 }] });

    await timeSeriesService.aggregateDailyAnalytics(new Date('2026-05-02T00:00:00.000Z'));

    expect(query).toHaveBeenLastCalledWith('SELECT refresh_analytics_daily_segments($1::date)', [
      '2026-05-02',
    ]);
  });

  it('adds cumulative lift and confidence intervals to chart data', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          date: new Date('2026-05-01T00:00:00.000Z'),
          variant_name: 'Control',
          visitors: '100',
          conversions: '10',
          revenue: '100',
          conversion_rate: '10',
        },
        {
          date: new Date('2026-05-01T00:00:00.000Z'),
          variant_name: 'Variant',
          visitors: '100',
          conversions: '15',
          revenue: '150',
          conversion_rate: '15',
        },
        {
          date: new Date('2026-05-02T00:00:00.000Z'),
          variant_name: 'Control',
          visitors: '100',
          conversions: '10',
          revenue: '100',
          conversion_rate: '10',
        },
        {
          date: new Date('2026-05-02T00:00:00.000Z'),
          variant_name: 'Variant',
          visitors: '100',
          conversions: '30',
          revenue: '300',
          conversion_rate: '30',
        },
      ],
    });

    const result = await timeSeriesService.getChartData('test-1', 'shop.myshopify.com', {
      controlVariantName: 'Control',
    });

    expect(result[1].Control.cumulativeVisitors).toBe(200);
    expect(result[1].Variant.cumulativeVisitors).toBe(200);
    expect(result[1].Variant.cumulativeConversionRate).toBe(22.5);
    expect(result[1].Variant.cumulativeLift).toBeCloseTo(125);
    expect(result[1].Variant.cumulativeCiLow).toBeLessThan(result[1].Variant.cumulativeCiHigh);
  });
});
