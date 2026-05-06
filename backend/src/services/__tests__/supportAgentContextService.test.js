const { buildSupportAgentContext } = require('../supportAgentContextService');

describe('supportAgentContextService', () => {
  it('uses authenticated request scope instead of body-provided store', () => {
    const context = buildSupportAgentContext(
      {
        shopDomain: 'owned.myshopify.com',
        email: 'owner@example.com',
        userId: 'user-1',
        authType: 'email_session',
        query: {},
        headers: {},
      },
      {
        store: 'other.myshopify.com',
      }
    );

    expect(context.store.domain).toBe('owned.myshopify.com');
    expect(context.actor.email_domain).toBe('example.com');
    expect(context.actor.email).toBeUndefined();
  });

  it('does not trust body store when no authenticated store exists', () => {
    const context = buildSupportAgentContext(
      {
        email: 'owner@example.com',
        userId: 'user-1',
        authType: 'email_session',
        query: {},
        headers: {},
      },
      {
        store: 'other.myshopify.com',
      }
    );

    expect(context.store.domain).toBeNull();
  });
});
