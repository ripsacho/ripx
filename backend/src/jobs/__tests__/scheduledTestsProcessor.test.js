jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../queue', () => ({
  scheduledTestsQueue: null,
}));

jest.mock('../../models/test', () => ({
  getTestById: jest.fn(),
  updateTest: jest.fn(),
}));

jest.mock('../../services/testActivationService', () => ({
  runActivationPreflight: jest.fn(),
}));

jest.mock('../../services/notificationService', () => ({
  createInAppNotification: jest.fn(),
}));

jest.mock('../../services/outboundWebhookService', () => ({
  fireWebhook: jest.fn(),
}));

jest.mock('../analyticsAutomation', () => ({
  getAutomationAnalytics: jest.fn(),
}));

const { query } = require('../../utils/database');
const logger = require('../../utils/logger');
const { getTestById, updateTest } = require('../../models/test');
const { runActivationPreflight } = require('../../services/testActivationService');
const { processScheduledStart } = require('../scheduledTestsProcessor');

describe('scheduledTestsProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks scheduled auto-start when activation preflight fails', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'test-1',
          shop_domain: 'test.myshopify.com',
          name: 'Draft test',
          status: 'draft',
        },
      ],
    });
    getTestById.mockResolvedValueOnce({
      id: 'test-1',
      shop_domain: 'test.myshopify.com',
      name: 'Draft test',
      status: 'draft',
      type: 'price',
      variants: [],
    });
    runActivationPreflight.mockResolvedValueOnce({
      ok: false,
      errors: [{ id: 'variants', message: 'Missing variants' }],
      warnings: [],
    });

    await processScheduledStart('test-1');

    expect(runActivationPreflight).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'test-1' }),
      'test.myshopify.com'
    );
    expect(updateTest).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Scheduled start blocked by activation preflight',
      expect.objectContaining({ testId: 'test-1', errors: 1 })
    );
  });

  it('starts a scheduled draft when activation preflight passes', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'test-2',
          shop_domain: 'test.myshopify.com',
          name: 'Ready draft',
          status: 'draft',
        },
      ],
    });
    getTestById.mockResolvedValueOnce({
      id: 'test-2',
      shop_domain: 'test.myshopify.com',
      name: 'Ready draft',
      status: 'draft',
      type: 'content',
      variants: [{ id: 'control', name: 'Control' }],
    });
    runActivationPreflight.mockResolvedValueOnce({ ok: true, errors: [], warnings: [] });

    await processScheduledStart('test-2');

    expect(updateTest).toHaveBeenCalledWith(
      'test-2',
      'test.myshopify.com',
      expect.objectContaining({
        status: 'running',
        started_at: expect.any(Date),
      })
    );
  });
});
