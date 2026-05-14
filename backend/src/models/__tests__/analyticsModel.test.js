jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

const { query } = require('../../utils/database');
const analytics = require('../analytics');

describe('analytics model database optimizations', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('batches secondary event metrics into one grouped query', async () => {
    query.mockResolvedValue({
      rows: [
        {
          event_name: 'add_to_cart',
          variant_id: 'variant-a',
          count: '3',
          sum: '42.50',
        },
      ],
    });

    const result = await analytics.getSecondaryEventMetrics('test-1', 'shop.myshopify.com', [
      'add_to_cart',
      'support_click',
      'add_to_cart',
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('e.event_name = ANY($3::text[])');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      ['add_to_cart', 'support_click'],
    ]);
    expect(result).toEqual({
      add_to_cart: {
        'variant-a': {
          count: 3,
          sum: 42.5,
        },
      },
      support_click: {},
    });
  });

  it('keeps segment filters in the batched secondary event query', async () => {
    query.mockResolvedValue({ rows: [] });

    await analytics.getSecondaryEventMetrics('test-1', 'shop.myshopify.com', ['add_to_cart'], {
      device: 'mobile',
      country: 'US',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('JOIN test_assignments ta');
    expect(query.mock.calls[0][0]).toContain('ta.device = $4');
    expect(query.mock.calls[0][0]).toContain('ta.country = $5');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      ['add_to_cart'],
      'mobile',
      'US',
    ]);
  });

  it('includes legacy checkout conversion rows when aggregating checkout signals', async () => {
    query.mockResolvedValue({ rows: [] });

    await analytics.getSecondaryEventMetrics('test-1', 'shop.myshopify.com', [
      'checkout_section_impression',
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("e.event_type = 'custom'");
    expect(query.mock.calls[0][0]).toContain("e.event_type = 'conversion'");
    expect(query.mock.calls[0][0]).toContain("LEFT(e.event_name, 9) = 'checkout_'");
  });

  it('normalizes shop domains and goal event names for secondary metrics', async () => {
    query.mockResolvedValue({ rows: [] });

    await analytics.getSecondaryEventMetrics('test-1', ' Shop.MyShopify.com ', [
      'Add To Cart',
      'add_to_cart',
      'Newsletter Signup!',
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($2))');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      ['add_to_cart', 'newsletter_signup'],
    ]);
  });

  it('normalizes incoming custom event names before insert', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'event-1', event_name: 'newsletter_signup' }],
    });

    await analytics.trackEvent({
      test_id: 'test-1',
      variant_id: 'variant-a',
      user_id: 'user-1',
      shop_domain: ' Shop.MyShopify.com ',
      event_type: 'custom',
      event_name: 'Newsletter Signup!',
      event_value: '5.5',
      metadata: [],
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).not.toContain('created_at');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'variant-a',
      'user-1',
      'shop.myshopify.com',
      'custom',
      5.5,
      'newsletter_signup',
      '{}',
    ]);
  });

  it('normalizes event explorer list filters consistently', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '0' }] }).mockResolvedValueOnce({ rows: [] });

    await analytics.getEventsList('test-1', ' Shop.MyShopify.com ', {
      event_name: 'Add To Cart',
      limit: 25,
      offset: 0,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($2))');
    expect(query.mock.calls[0][1]).toEqual(['test-1', 'shop.myshopify.com', 'add_to_cart']);
  });

  it('keeps segment filters in the event explorer list query', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '0' }] }).mockResolvedValueOnce({ rows: [] });

    await analytics.getEventsList('test-1', ' Shop.MyShopify.com ', {
      device: 'mobile',
      country: 'US',
      event_name: 'Add To Cart',
      limit: 25,
      offset: 0,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('COUNT(DISTINCT e.id)');
    expect(query.mock.calls[1][0]).toContain('SELECT DISTINCT e.id');
    expect(query.mock.calls[0][0]).toContain('JOIN test_assignments ta');
    expect(query.mock.calls[0][0]).toContain('ta.device = $3');
    expect(query.mock.calls[0][0]).toContain('ta.country = $4');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'mobile',
      'US',
      'add_to_cart',
    ]);
  });

  it('applies date filters to visitor and conversion analytics scopes', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ variant_id: 'control', variant_name: 'Control', visitors: '10' }],
      })
      .mockResolvedValueOnce({
        rows: [{ variant_id: 'control', conversions: '2', revenue: '120' }],
      });

    await analytics.getTestAnalytics('test-1', 'shop.myshopify.com', {
      device: 'mobile',
      start_date: '2026-05-01',
      end_date: '2026-05-08',
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('ta.assigned_at >= $4');
    expect(query.mock.calls[0][0]).toContain('ta.assigned_at < $5');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'mobile',
      '2026-05-01',
      '2026-05-08',
    ]);
    expect(query.mock.calls[1][0]).toContain('ta.assigned_at >= $4 AND e.created_at >= $4');
    expect(query.mock.calls[1][0]).toContain('ta.assigned_at < $5 AND e.created_at < $5');
    expect(query.mock.calls[1][0]).toContain("NOT (LEFT(e.event_name, 9) = 'checkout_')");
    expect(query.mock.calls[1][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'mobile',
      '2026-05-01',
      '2026-05-08',
    ]);
  });

  it('returns checkout event breakdown rows grouped by metadata', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          event_name: 'checkout_section_cta_click',
          variant_id: 'variant-a',
          checkout_phase: 'experience',
          checkout_section_id: 'trust-box',
          checkout_section_type: 'trust_box',
          diagnostic_reason: null,
          checkout_customization_type: null,
          checkout_method_action: null,
          total_events: '5',
          unique_users: '4',
          sum: '0',
          first_seen: '2026-05-01T00:00:00.000Z',
          last_seen: '2026-05-02T00:00:00.000Z',
        },
      ],
    });

    const result = await analytics.getCheckoutEventBreakdown('test-1', ' Shop.MyShopify.com ', {
      device: 'mobile',
      country: 'US',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("LEFT(e.event_name, 9) = 'checkout_'");
    expect(query.mock.calls[0][0]).toContain("e.event_type = 'custom'");
    expect(query.mock.calls[0][0]).toContain("e.event_type = 'conversion'");
    expect(query.mock.calls[0][0]).toContain('ta.device = $3');
    expect(query.mock.calls[0][0]).toContain('ta.country = $4');
    expect(query.mock.calls[0][1]).toEqual(['test-1', 'shop.myshopify.com', 'mobile', 'US']);
    expect(result).toEqual([
      expect.objectContaining({
        eventName: 'checkout_section_cta_click',
        variantId: 'variant-a',
        checkoutSectionId: 'trust-box',
        checkoutSectionType: 'trust_box',
        totalEvents: 5,
        uniqueUsers: 4,
      }),
    ]);
  });

  it('returns collection health stats for configured event goals', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            event_name: 'add_to_cart',
            variant_id: 'variant-a',
            total_events: '4',
            unique_users: '3',
            sum: '10.5',
            first_seen: '2026-05-01T00:00:00.000Z',
            last_seen: '2026-05-02T00:00:00.000Z',
          },
          {
            event_name: 'add_to_cart',
            variant_id: 'variant-b',
            total_events: '2',
            unique_users: '2',
            sum: '5',
            first_seen: '2026-05-01T12:00:00.000Z',
            last_seen: '2026-05-03T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_name: 'add_to_cart',
            total_events: '6',
            unique_users: '4',
            sum: '15.5',
            first_seen: '2026-05-01T00:00:00.000Z',
            last_seen: '2026-05-03T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_name: 'add_to_cart',
            source: 'goals_metrics_catalog',
            trigger_type: 'click',
            count: '6',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_name: 'add_to_cart',
            bucket: '2026-05-01',
            total_events: '3',
            unique_users: '2',
            sum: '7.5',
          },
          {
            event_name: 'add_to_cart',
            bucket: '2026-05-02',
            total_events: '3',
            unique_users: '2',
            sum: '8',
          },
        ],
      });

    const result = await analytics.getEventCollectionStats('test-1', ' Shop.MyShopify.com ', [
      'Add To Cart',
      'newsletter_signup',
    ]);

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0][0]).toContain('LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($2))');
    expect(query.mock.calls[3][0]).toContain("DATE_TRUNC('day', e.created_at)");
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      ['add_to_cart', 'newsletter_signup'],
    ]);
    expect(result.add_to_cart).toEqual({
      totalEvents: 6,
      uniqueUsers: 4,
      sum: 15.5,
      firstSeen: '2026-05-01T00:00:00.000Z',
      lastSeen: '2026-05-03T00:00:00.000Z',
      byVariant: {
        'variant-a': {
          totalEvents: 4,
          uniqueUsers: 3,
          sum: 10.5,
          firstSeen: '2026-05-01T00:00:00.000Z',
          lastSeen: '2026-05-02T00:00:00.000Z',
        },
        'variant-b': {
          totalEvents: 2,
          uniqueUsers: 2,
          sum: 5,
          firstSeen: '2026-05-01T12:00:00.000Z',
          lastSeen: '2026-05-03T00:00:00.000Z',
        },
      },
      sources: [{ source: 'goals_metrics_catalog', triggerType: 'click', count: 6 }],
      trend: [
        {
          date: '2026-05-01',
          totalEvents: 3,
          uniqueUsers: 2,
          sum: 7.5,
        },
        {
          date: '2026-05-02',
          totalEvents: 3,
          uniqueUsers: 2,
          sum: 8,
        },
      ],
    });
    expect(result.newsletter_signup).toEqual({
      totalEvents: 0,
      uniqueUsers: 0,
      sum: 0,
      firstSeen: null,
      lastSeen: null,
      byVariant: {},
      sources: [],
      trend: [],
    });
  });

  it('normalizes shop domains and custom step names for funnel metrics', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await analytics.getFunnelMetrics('test-1', ' Shop.MyShopify.com ', {
      funnel_steps: [
        { id: 'visitors', label: 'Visitors', type: 'visitors' },
        { id: 'newsletter', label: 'Newsletter', type: 'event', event_name: 'Newsletter Signup!' },
        { id: 'conversion', label: 'Purchase', type: 'conversion' },
      ],
      device: 'mobile',
      conversionWindowDays: 7,
      conversionUrl: '/thank-you',
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(result.mode).toBe('step_reach');
    expect(result.semantics).toEqual({
      counting: 'distinct_users_per_step',
      ordered: false,
      visitorDate: 'test_assignments.assigned_at',
      eventDate: 'events.created_at',
    });
    expect(query.mock.calls[0][0]).toContain('LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM($2))');
    expect(query.mock.calls[1][0]).toContain('LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($2))');
    expect(query.mock.calls[1][0]).toContain(
      'LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM(e.shop_domain))'
    );
    expect(query.mock.calls[1][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'newsletter_signup',
      'mobile',
    ]);
    expect(query.mock.calls[2][0]).toContain("e.event_type = 'conversion'");
    expect(query.mock.calls[2][0]).toContain(
      "e.created_at <= ta.assigned_at + ($4 || ' days')::interval"
    );
    expect(query.mock.calls[2][0]).toContain("(e.metadata->>'conversion_url')::text ILIKE $5");
    expect(query.mock.calls[2][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'mobile',
      7,
      '%/thank-you%',
    ]);
  });

  it('aliases visitor counts to custom visitor step ids in funnel metrics', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ variant_id: 'control', variant_name: 'Control', count: '25' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await analytics.getFunnelMetrics('test-1', 'shop.myshopify.com', {
      funnel_steps: [
        { id: 'assigned_users', label: 'Assigned users', type: 'visitors' },
        { id: 'purchase', label: 'Purchase', type: 'conversion' },
      ],
    });

    expect(result.byVariant.control).toMatchObject({
      visitors: 25,
      assigned_users: 25,
      purchase: 0,
    });
    expect(result.transitionsByVariant.control).toEqual([
      expect.objectContaining({
        fromStepId: 'assigned_users',
        toStepId: 'purchase',
        fromCount: 25,
        toCount: 0,
        dropOff: 25,
      }),
    ]);
  });

  it('applies assignment and event date filters to step-reach funnel event queries', async () => {
    query.mockResolvedValue({ rows: [] });

    await analytics.getFunnelMetrics('test-1', 'shop.myshopify.com', {
      funnel_steps: [
        { id: 'visitors', label: 'Visitors', type: 'visitors' },
        { id: 'add_to_cart', label: 'Add to Cart', type: 'event', event_name: 'add_to_cart' },
        { id: 'conversion', label: 'Purchase', type: 'conversion' },
      ],
      start_date: '2026-05-01',
      end_date: '2026-05-08',
    });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain('ta.assigned_at >= $4');
    expect(query.mock.calls[1][0]).toContain('e.created_at >= $4');
    expect(query.mock.calls[1][0]).toContain('ta.assigned_at < $5');
    expect(query.mock.calls[1][0]).toContain('e.created_at < $5');
    expect(query.mock.calls[1][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'add_to_cart',
      '2026-05-01',
      '2026-05-08',
    ]);
    expect(query.mock.calls[2][0]).toContain('ta.assigned_at >= $3');
    expect(query.mock.calls[2][0]).toContain('e.created_at >= $3');
    expect(query.mock.calls[2][0]).toContain('ta.assigned_at < $4');
    expect(query.mock.calls[2][0]).toContain('e.created_at < $4');
    expect(query.mock.calls[2][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      '2026-05-01',
      '2026-05-08',
    ]);
  });

  it('supports ordered funnel sequence counting', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ variant_id: 'control', variant_name: 'Control', count: '10' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { step_id: 'add_to_cart', variant_id: 'control', count: '6' },
          { step_id: 'conversion', variant_id: 'control', count: '3' },
        ],
      });

    const result = await analytics.getFunnelMetrics('test-1', 'shop.myshopify.com', {
      funnel_mode: 'ordered',
      funnel_steps: [
        { id: 'visitors', label: 'Visitors', type: 'visitors' },
        { id: 'add_to_cart', label: 'Add to Cart', type: 'event', event_name: 'add_to_cart' },
        { id: 'conversion', label: 'Purchase', type: 'conversion' },
      ],
      conversionWindowDays: 14,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('WITH assigned AS');
    expect(query.mock.calls[1][0]).toContain('FROM step_1 s');
    expect(query.mock.calls[1][0]).toContain("e.event_type = 'conversion'");
    expect(query.mock.calls[1][0]).toContain("SELECT 'conversion' AS step_id");
    expect(query.mock.calls[1][1]).toEqual(['test-1', 'shop.myshopify.com', 'add_to_cart', 14]);
    expect(result.mode).toBe('ordered_sequence');
    expect(result.semantics.ordered).toBe(true);
    expect(result.byVariant.control).toEqual({ visitors: 10, add_to_cart: 6, conversion: 3 });
    expect(result.transitionsByVariant.control).toEqual([
      expect.objectContaining({
        fromStepId: 'visitors',
        toStepId: 'add_to_cart',
        transitionRate: 60,
      }),
      expect.objectContaining({
        fromStepId: 'add_to_cart',
        toStepId: 'conversion',
        transitionRate: 50,
        dropOff: 3,
      }),
    ]);
  });

  it('returns assignment cohort rows with scoped filters', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          cohort_period: new Date('2026-05-04T00:00:00.000Z'),
          variant_id: 'control',
          variant_name: 'Control',
          visitors: '20',
          conversions: '4',
          revenue: '80',
        },
      ],
    });

    const result = await analytics.getAssignmentCohorts('test-1', ' Shop.MyShopify.com ', {
      granularity: 'week',
      device: 'mobile',
      country: 'US',
      start_date: '2026-05-01',
      end_date: '2026-05-10',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("date_trunc('week'");
    expect(query.mock.calls[0][0]).toContain('ta.device = $3');
    expect(query.mock.calls[0][0]).toContain('ta.country = $4');
    expect(query.mock.calls[0][0]).toContain('e.created_at >= $5');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'mobile',
      'US',
      '2026-05-01',
      '2026-05-10',
    ]);
    expect(result).toEqual([
      {
        cohortPeriod: '2026-05-04',
        variantId: 'control',
        variantName: 'Control',
        visitors: 20,
        conversions: 4,
        revenue: 80,
        conversionRate: 20,
        revenuePerVisitor: 4,
      },
    ]);
  });

  it('returns warnings for invalid custom funnel steps', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await analytics.getFunnelMetrics('test-1', 'shop.myshopify.com', {
      funnel_steps: [
        { id: 'visitors', label: 'Visitors', type: 'visitors' },
        { id: 'bad-event', label: 'Bad Event', type: 'event' },
        { id: 'unknown', label: 'Unknown', type: 'custom_kind' },
      ],
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.steps).toEqual([{ id: 'visitors', label: 'Visitors', type: 'visitors' }]);
    expect(result.warnings).toEqual([
      {
        code: 'missing_event_name',
        stepId: 'bad-event',
        message: 'Bad Event is missing an event key and cannot be counted.',
      },
      {
        code: 'unsupported_step_type',
        stepId: 'unknown',
        message: 'Unknown uses unsupported funnel step type "custom_kind".',
      },
    ]);
  });

  it('normalizes shop domains when counting events by type', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '2' }] });

    const count = await analytics.getEventCount('test-1', ' Shop.MyShopify.com ', 'custom');

    expect(count).toBe(2);
    expect(query.mock.calls[0][0]).toContain('LOWER(TRIM(shop_domain)) = LOWER(TRIM($2))');
    expect(query.mock.calls[0][1]).toEqual(['test-1', 'shop.myshopify.com', 'custom']);
  });

  it('filters event facets by segment and date options', async () => {
    query.mockResolvedValueOnce({
      rows: [{ event_type: 'custom', event_name: 'add_to_cart' }],
    });

    const result = await analytics.getEventTypesForTest('test-1', ' Shop.MyShopify.com ', {
      device: 'mobile',
      country: 'US',
      start_date: '2026-05-01',
      end_date: '2026-05-08',
    });

    expect(result).toEqual({ types: ['custom'], names: ['add_to_cart'] });
    expect(query.mock.calls[0][0]).toContain('JOIN test_assignments ta');
    expect(query.mock.calls[0][0]).toContain('ta.device = $3');
    expect(query.mock.calls[0][0]).toContain('ta.country = $4');
    expect(query.mock.calls[0][0]).toContain('e.created_at >= $5');
    expect(query.mock.calls[0][0]).toContain('e.created_at < $6');
    expect(query.mock.calls[0][1]).toEqual([
      'test-1',
      'shop.myshopify.com',
      'mobile',
      'US',
      '2026-05-01',
      '2026-05-08',
    ]);
  });

  it('uses ON CONFLICT to preserve richer duplicate conversion data', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'event-1' }] });

    const result = await analytics.trackEvent({
      test_id: 'test-1',
      variant_id: 'variant-a',
      user_id: 'user-1',
      shop_domain: 'shop.myshopify.com',
      event_type: 'conversion',
      metadata: { order_id: 'order-1' },
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      "ON CONFLICT (test_id, user_id, (metadata->>'order_id'))"
    );
    expect(query.mock.calls[0][0]).toContain(
      "WHERE event_type = 'conversion' AND metadata ? 'order_id' AND metadata->>'order_id' <> ''"
    );
    expect(query.mock.calls[0][0]).toContain('DO UPDATE SET');
    expect(query.mock.calls[0][0]).toContain(
      'event_value = GREATEST(events.event_value, EXCLUDED.event_value)'
    );
    expect(query.mock.calls[0][0]).toContain(
      "metadata = COALESCE(events.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb)"
    );
    expect(result).toEqual({ id: 'event-1' });
  });

  it('returns the updated existing row when duplicate conversion data is merged', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'event-1', event_value: '120.00', metadata: { order_id: 'order-1' } }],
    });

    const result = await analytics.trackEvent({
      test_id: 'test-1',
      variant_id: 'variant-a',
      user_id: 'user-1',
      shop_domain: 'shop.myshopify.com',
      event_type: 'conversion',
      metadata: { order_id: 'order-1' },
    });

    expect(result).toEqual({
      id: 'event-1',
      event_value: '120.00',
      metadata: { order_id: 'order-1' },
    });
  });

  it('leaves named event rollup maintenance to the database trigger', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'event-1',
          test_id: 'test-1',
          shop_domain: 'shop.myshopify.com',
          event_name: 'page_view',
          created_at: '2026-04-01T00:00:00.000Z',
        },
      ],
    });

    const result = await analytics.trackEvent({
      test_id: 'test-1',
      variant_id: 'variant-a',
      user_id: 'user-1',
      shop_domain: 'shop.myshopify.com',
      event_type: 'custom',
      event_name: 'page_view',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('RETURNING *');
    expect(query.mock.calls[0][0]).not.toContain('goal_metric_event_rollups');
    expect(result).toEqual({
      id: 'event-1',
      test_id: 'test-1',
      shop_domain: 'shop.myshopify.com',
      event_name: 'page_view',
      created_at: '2026-04-01T00:00:00.000Z',
    });
  });

  it('does not run app-side rollup writes when duplicate conversion data updates an existing event', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'event-1',
          test_id: 'test-1',
          shop_domain: 'shop.myshopify.com',
          event_name: 'purchase',
          metadata: { order_id: 'order-1' },
        },
      ],
    });

    await analytics.trackEvent({
      test_id: 'test-1',
      variant_id: 'variant-a',
      user_id: 'user-1',
      shop_domain: 'shop.myshopify.com',
      event_type: 'conversion',
      event_name: 'purchase',
      metadata: { order_id: 'order-1' },
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).not.toContain('goal_metric_event_rollups');
  });
});
