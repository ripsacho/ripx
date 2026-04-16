function loadServiceWithQueryRows(rows) {
  jest.resetModules();
  jest.doMock('../utils/database', () => ({
    query: jest.fn(() => ({ rows })),
  }));

  // eslint-disable-next-line global-require
  const service = require('../services/testTypeControlService');
  // eslint-disable-next-line global-require
  const db = require('../utils/database');
  return { service, queryMock: db.query };
}

describe('testTypeControlService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('merges legacy global disable/message with store hidden override', async () => {
    const { service, queryMock } = loadServiceWithQueryRows([
      { key: 'test_type.enabled.offer', value: 'false' },
      { key: 'test_type.message.offer', value: 'Offers are paused globally.' },
      {
        key: 'test_type.rule.store.demo-shop.myshopify.com.offer',
        value: JSON.stringify({ mode: 'hidden', message: '' }),
      },
    ]);

    const snapshot = await service.getTestTypeControlSnapshot({
      domain: 'demo-shop.myshopify.com',
    });
    const offer = snapshot.types.find(type => type.key === 'offer');

    expect(queryMock).toHaveBeenCalled();
    expect(offer.global.mode).toBe('disabled');
    expect(offer.global.message).toBe('Offers are paused globally.');
    expect(offer.store.mode).toBe('hidden');
    expect(offer.effective.mode).toBe('hidden');
    expect(offer.effective.hidden).toBe(true);
    expect(offer.effective.visible).toBe(false);
  });

  test('uses new global rule and store inherit by default', async () => {
    const { service } = loadServiceWithQueryRows([
      {
        key: 'test_type.rule.global.shipping',
        value: JSON.stringify({ mode: 'disabled', message: 'Shipping tests are under review.' }),
      },
    ]);

    const snapshot = await service.getTestTypeControlSnapshot({ domain: 'example.com' });
    const shipping = snapshot.types.find(type => type.key === 'shipping');

    expect(shipping.global.mode).toBe('disabled');
    expect(shipping.store.mode).toBe('inherit');
    expect(shipping.effective.mode).toBe('disabled');
    expect(shipping.effective.message).toBe('Shipping tests are under review.');
    expect(shipping.effective.enabled).toBe(false);
  });
});
