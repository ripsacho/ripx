jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../tenant', () => ({
  getTenantByDomain: jest.fn(),
}));

const { query } = require('../../utils/database');
const {
  createTest,
  getTestById,
  getTestsByIds,
  getActiveTestsForStorefront,
  updateTestStatus,
  updateTest,
  deleteTest,
} = require('../test');

describe('test model shop_domain lookup hardening', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('getTestById uses normalized shop_domain SQL filter', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: '8f39c136-0e11-4249-8ef0-434c74f739cc',
          goal: '{"type":"purchase"}',
          variants:
            '[{"id":"v1","name":"A","allocation":50},{"id":"v2","name":"B","allocation":50}]',
          segments: '{}',
          target_ids: '["gid://shopify/Product/123"]',
        },
      ],
      rowCount: 1,
    });

    const out = await getTestById(
      '8f39c136-0e11-4249-8ef0-434c74f739cc',
      'MakRipon.MyShopify.com '
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('LOWER(TRIM(shop_domain)) = LOWER(TRIM($2))');
    expect(params).toEqual(['8f39c136-0e11-4249-8ef0-434c74f739cc', 'MakRipon.MyShopify.com ']);
    expect(out).toBeTruthy();
    expect(out.goal).toEqual({ type: 'purchase' });
    expect(Array.isArray(out.variants)).toBe(true);
    expect(out.target_ids).toEqual(['gid://shopify/Product/123']);
  });

  it('createTest hydrates JSON response fields used by draft saves', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ column_name: 'scheduled_start_at' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            shop_domain: 'MakRipon.MyShopify.com',
            name: 'Draft test',
            type: 'content',
            status: 'draft',
            goal: '{"type":"conversion","metric":"revenue"}',
            variants: '[{"name":"Control","allocation":50},{"name":"Variant A","allocation":50}]',
            segments: '{"device":"mobile","traffic_ramp_percent":25}',
            target_ids: '["gid://shopify/Product/456"]',
          },
        ],
        rowCount: 1,
      });

    const out = await createTest({
      shop_domain: 'MakRipon.MyShopify.com',
      name: 'Draft test',
      type: 'content',
      goal: { type: 'conversion', metric: 'revenue' },
      variants: [
        { name: 'Control', allocation: 50 },
        { name: 'Variant A', allocation: 50 },
      ],
      segments: { device: 'mobile', traffic_ramp_percent: 25 },
      target_ids: ['gid://shopify/Product/456'],
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(out.goal).toEqual({ type: 'conversion', metric: 'revenue' });
    expect(out.segments).toEqual({ device: 'mobile', traffic_ramp_percent: 25 });
    expect(out.target_ids).toEqual(['gid://shopify/Product/456']);
    expect(out.variants[0].id).toBe('Control');
  });

  it('getTestsByIds uses normalized shop_domain SQL filter', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          goal: '{}',
          variants: '[]',
          segments: '{}',
          target_ids: null,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          goal: '{}',
          variants: '[]',
          segments: '{}',
          target_ids: '[]',
        },
      ],
      rowCount: 2,
    });

    const map = await getTestsByIds(
      ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      ' MAKRIPON.myshopify.com'
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))');
    expect(sql).toContain('id IN ($2, $3)');
    expect(params).toEqual([
      ' MAKRIPON.myshopify.com',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(map.size).toBe(2);
    expect(map.get('11111111-1111-4111-8111-111111111111')).toBeTruthy();
    expect(map.get('22222222-2222-4222-8222-222222222222')).toBeTruthy();
  });

  it('getActiveTestsForStorefront uses normalized shop_domain SQL filter', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await getActiveTestsForStorefront(' MAKRIPON.myshopify.com ');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))');
    expect(params).toEqual([' MAKRIPON.myshopify.com ']);
  });

  it('updateTestStatus uses normalized shop_domain SQL filter', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          goal: '{}',
          variants: '[]',
        },
      ],
      rowCount: 1,
    });

    await updateTestStatus(
      '11111111-1111-4111-8111-111111111111',
      ' MakRipon.MyShopify.com ',
      'running'
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('LOWER(TRIM(shop_domain)) = LOWER(TRIM($3))');
  });

  it('updateTest uses normalized shop_domain SQL filter', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          goal: '{}',
          variants: '[]',
          segments: '{}',
          target_ids: '["gid://shopify/Product/789"]',
        },
      ],
      rowCount: 1,
    });

    const out = await updateTest(
      '11111111-1111-4111-8111-111111111111',
      ' MakRipon.MyShopify.com ',
      {
        name: 'Updated test name',
        tenant_id: '99999999-9999-4999-8999-999999999999',
      }
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('LOWER(TRIM(shop_domain)) = LOWER(TRIM($');
    expect(sql).not.toContain('tenant_id =');
    expect(out.target_ids).toEqual(['gid://shopify/Product/789']);
  });

  it('deleteTest uses normalized shop_domain SQL filter', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await deleteTest('11111111-1111-4111-8111-111111111111', ' MakRipon.MyShopify.com ');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('LOWER(TRIM(shop_domain)) = LOWER(TRIM($2))');
  });
});
