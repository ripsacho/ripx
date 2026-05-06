jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

const { query } = require('../../utils/database');
const {
  listGoalMetricDefinitions,
  refreshGoalMetricEventRollups,
} = require('../goalMetricDefinition');

describe('goalMetricDefinition database optimizations', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('scopes rollup observed event aggregation to known catalog events', async () => {
    let observedSql = '';
    let observedParams = [];

    query.mockImplementation((sql, params) => {
      if (String(sql).includes('FROM goal_metric_definitions')) {
        return {
          rows: [
            {
              id: 'custom-1',
              shop_domain: 'shop.myshopify.com',
              name: 'Custom engagement',
              event_name: 'custom_engagement',
              description: '',
              category: 'custom',
              aggregation: 'count',
              direction: 'increase',
              metric_role: 'secondary',
              trigger_type: 'custom_event',
              trigger_config: {},
              tags: [],
              builtin: false,
            },
          ],
        };
      }
      if (String(sql).includes('FROM goal_metric_event_rollups')) {
        observedSql = sql;
        observedParams = params;
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    await listGoalMetricDefinitions('shop.myshopify.com');

    expect(observedSql).toContain('event_name = ANY($2::text[])');
    expect(observedSql).toContain('rollups.event_name = ANY($2::text[])');
    expect(observedSql).toContain(
      'rollups.tenant_id = (SELECT id FROM tenants WHERE domain = $1 LIMIT 1)'
    );
    expect(observedSql).toContain('SUM(rollups.event_count)::bigint AS count');
    expect(observedParams[0]).toBe('shop.myshopify.com');
    expect(observedParams[1]).toContain('custom_engagement');
    expect(observedParams[1]).toContain('page_view');
  });

  it('falls back to raw events when rollups are not migrated yet', async () => {
    const rollupError = new Error('relation "goal_metric_event_rollups" does not exist');
    let rawSql = '';

    query.mockImplementation(sql => {
      if (String(sql).includes('FROM goal_metric_definitions')) {
        return { rows: [] };
      }
      if (String(sql).includes('FROM goal_metric_event_rollups')) {
        throw rollupError;
      }
      if (String(sql).includes('FROM events')) {
        rawSql = sql;
        return {
          rows: [
            {
              event_name: 'page_view',
              count: 2,
              last_seen_at: '2026-04-01T00:00:00.000Z',
              test_breakdown: [],
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    const definitions = await listGoalMetricDefinitions('shop.myshopify.com');

    expect(rawSql).toContain('FROM events');
    expect(rawSql).toContain('e.tenant_id = (SELECT id FROM tenants WHERE domain = $1 LIMIT 1)');
    expect(rawSql).toContain('e.event_name = ANY($2::text[])');
    expect(definitions.find(item => item.event_name === 'page_view').observed_count).toBe(2);
  });

  it('rebuilds goal metric event rollups with normalized optional shop scope', async () => {
    query.mockResolvedValueOnce({
      rows: [{ all_time_rows: '4', daily_rows: '7' }],
    });

    const result = await refreshGoalMetricEventRollups(' Shop.MyShopify.com ');

    expect(query).toHaveBeenCalledWith('SELECT * FROM refresh_goal_metric_event_rollups($1)', [
      'shop.myshopify.com',
    ]);
    expect(result).toEqual({
      allTimeRows: 4,
      dailyRows: 7,
      shopDomain: 'shop.myshopify.com',
    });
  });
});
