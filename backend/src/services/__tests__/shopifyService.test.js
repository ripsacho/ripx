const shopifyService = require('../shopifyService');

describe('shopifyService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('formats Admin REST object errors as readable messages', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          errors: {
            base: ['RipX Shipping Rate - 131bdc89 is already configured'],
          },
        })
      ),
    });

    await expect(
      shopifyService.requestAdminRest('ripx-plus.myshopify.com', 'token', {
        method: 'POST',
        path: 'carrier_services.json',
        body: {
          carrier_service: {
            name: 'RipX Shipping Rate - 131bdc89',
          },
        },
      })
    ).rejects.toMatchObject({
      name: 'ShopifyApiError',
      status: 422,
      message: 'base: RipX Shipping Rate - 131bdc89 is already configured',
    });
  });
});
