jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

const { query } = require('../../utils/database');
const { encryptSecret, isEncryptedSecret } = require('../../utils/secretCrypto');
const { getIntegrationConfig, saveIntegrationConfig } = require('../integrationConfigService');

describe('integrationConfigService secret encryption', () => {
  const originalKey = process.env.RIPX_SECRET_ENCRYPTION_KEY;

  beforeEach(() => {
    query.mockReset();
    process.env.RIPX_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.RIPX_SECRET_ENCRYPTION_KEY;
    } else {
      process.env.RIPX_SECRET_ENCRYPTION_KEY = originalKey;
    }
  });

  it('encrypts GA4 and BigQuery secrets when saving integration config', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await saveIntegrationConfig('shop.myshopify.com', {
      ga4MeasurementId: 'G-123',
      ga4ApiSecret: 'ga4-secret',
      bigqueryProjectId: 'project-1',
      bigqueryDataset: 'ripx_analytics',
      bigqueryCredentials: '{"client_email":"svc@example.com"}',
    });

    const params = query.mock.calls[0][1];
    expect(params[2]).not.toBe('ga4-secret');
    expect(params[5]).not.toContain('svc@example.com');
    expect(isEncryptedSecret(params[2])).toBe(true);
    expect(isEncryptedSecret(params[5])).toBe(true);
  });

  it('decrypts encrypted secrets and still accepts legacy plaintext rows', async () => {
    await saveIntegrationConfig('shop.myshopify.com', {
      ga4MeasurementId: 'G-123',
      ga4ApiSecret: 'ga4-secret',
      bigqueryProjectId: 'project-1',
      bigqueryDataset: 'ripx_analytics',
      bigqueryCredentials: '{"client_email":"svc@example.com"}',
    });
    const encryptedParams = query.mock.calls[0][1];

    query.mockResolvedValueOnce({
      rows: [
        {
          ga4_measurement_id: 'G-123',
          ga4_api_secret: encryptedParams[2],
          bigquery_project_id: 'project-1',
          bigquery_dataset: 'ripx_analytics',
          bigquery_credentials: encryptedParams[5],
        },
      ],
    });

    const encrypted = await getIntegrationConfig('shop.myshopify.com');
    expect(encrypted.ga4ApiSecret).toBe('ga4-secret');
    expect(encrypted.bigqueryCredentials).toContain('svc@example.com');

    query.mockResolvedValueOnce({
      rows: [
        {
          ga4_measurement_id: 'G-456',
          ga4_api_secret: 'legacy-secret',
          bigquery_project_id: 'project-2',
          bigquery_dataset: 'ripx_analytics',
          bigquery_credentials: '{"legacy":true}',
        },
      ],
    });

    const legacy = await getIntegrationConfig('shop.myshopify.com');
    expect(legacy.ga4ApiSecret).toBe('legacy-secret');
    expect(legacy.bigqueryCredentials).toBe('{"legacy":true}');
  });

  it('preserves already encrypted secret values during save', async () => {
    const encryptedGa4Secret = encryptSecret('existing-ga4-secret');
    const encryptedBigQueryCredentials = encryptSecret('{"client_email":"svc@example.com"}');

    await saveIntegrationConfig('shop.myshopify.com', {
      ga4MeasurementId: 'G-123',
      ga4ApiSecret: encryptedGa4Secret,
      bigqueryProjectId: 'project-1',
      bigqueryDataset: 'ripx_analytics',
      bigqueryCredentials: encryptedBigQueryCredentials,
    });

    const params = query.mock.calls[0][1];
    expect(params[2]).toBe(encryptedGa4Secret);
    expect(params[5]).toBe(encryptedBigQueryCredentials);
  });
});
