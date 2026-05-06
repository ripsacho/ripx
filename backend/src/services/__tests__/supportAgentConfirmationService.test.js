const {
  createConfirmationToken,
  verifyConfirmationToken,
  hashArgs,
} = require('../supportAgentConfirmationService');

describe('supportAgentConfirmationService', () => {
  const originalSecret = process.env.SUPPORT_AGENT_CONFIRMATION_SECRET;

  beforeEach(() => {
    process.env.SUPPORT_AGENT_CONFIRMATION_SECRET = 'test-confirmation-secret';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SUPPORT_AGENT_CONFIRMATION_SECRET;
    } else {
      process.env.SUPPORT_AGENT_CONFIRMATION_SECRET = originalSecret;
    }
  });

  it('creates and verifies a scoped confirmation token', () => {
    const req = {
      userId: 'user-1',
      email: 'user@example.com',
      shopDomain: 'store.myshopify.com',
    };
    const token = createConfirmationToken({
      action: 'create_support_ticket',
      args: { subject: 'Help', message: 'Need help' },
      req,
    });

    const payload = verifyConfirmationToken(token, req);
    expect(payload.action).toBe('create_support_ticket');
    expect(payload.args_hash).toBe(hashArgs(payload.args));
  });

  it('rejects token reuse for another store', () => {
    const token = createConfirmationToken({
      action: 'create_support_ticket',
      args: { subject: 'Help' },
      req: { userId: 'user-1', email: 'user@example.com', shopDomain: 'a.myshopify.com' },
    });

    expect(() =>
      verifyConfirmationToken(token, {
        userId: 'user-1',
        email: 'user@example.com',
        shopDomain: 'b.myshopify.com',
      })
    ).toThrow(/store mismatch/i);
  });
});
