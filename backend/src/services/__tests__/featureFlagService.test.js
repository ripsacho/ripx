jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

const { query } = require('../../utils/database');
const { evaluateFlags } = require('../featureFlagService');

describe('featureFlagService database batching', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('loads all global and domain-scoped flags in one query', async () => {
    query.mockResolvedValue({
      rows: [
        {
          key: 'flag.checkout.shop.myshopify.com',
          value: 'true',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          key: 'flag.assistant',
          value: 'false',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    const result = await evaluateFlags(['checkout', 'assistant', 'checkout'], {
      domain: 'shop.myshopify.com',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toBe(
      'SELECT key, value, updated_at FROM key_value_store WHERE key = ANY($1::text[])'
    );
    expect(query.mock.calls[0][1]).toEqual([
      [
        'flag.checkout.shop.myshopify.com',
        'flag.assistant.shop.myshopify.com',
        'flag.checkout',
        'flag.assistant',
      ],
    ]);
    expect(result['flag.checkout']).toMatchObject({
      enabled: true,
      source: 'domain',
    });
    expect(result['flag.assistant']).toMatchObject({
      enabled: false,
      source: 'global',
    });
  });
});
