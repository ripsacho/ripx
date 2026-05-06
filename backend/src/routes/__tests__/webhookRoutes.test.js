const { verifyWebhook } = require('../webhookRoutes');

describe('webhookRoutes HMAC verification', () => {
  const previousSecret = process.env.SHOPIFY_API_SECRET;

  afterEach(() => {
    process.env.SHOPIFY_API_SECRET = previousSecret;
  });

  it('rejects malformed HMAC headers without throwing', () => {
    process.env.SHOPIFY_API_SECRET = 'test_secret';

    expect(() => verifyWebhook(Buffer.from('{"id":1}'), 'bad')).not.toThrow();
    expect(verifyWebhook(Buffer.from('{"id":1}'), 'bad')).toBe(false);
  });
});
