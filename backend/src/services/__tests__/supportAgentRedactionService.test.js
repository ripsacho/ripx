const { redactForLlm, redactText } = require('../supportAgentRedactionService');

describe('supportAgentRedactionService', () => {
  it('redacts common token and API key shapes in text', () => {
    const text =
      'Use Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.signature123456 and sk-test_123456789012345678901234 for this shpat_123456789012345678901234 token.';
    const redacted = redactText(text);
    expect(redacted).toContain('Bearer [REDACTED_TOKEN]');
    expect(redacted).toContain('[REDACTED_API_KEY]');
    expect(redacted).toContain('[REDACTED_SHOPIFY_TOKEN]');
  });

  it('does not redact ordinary dotted product strings as tokens', () => {
    expect(redactText('foo.bar.baz should remain visible')).toContain('foo.bar.baz');
  });

  it('redacts secret-like object keys and custom javascript', () => {
    const redacted = redactForLlm({
      apiKey: 'sk-test_123456789012345678901234',
      nested: {
        access_token: 'shpat_123456789012345678901234',
        custom_javascript: 'window.alert("secret")',
      },
    });

    expect(redacted.apiKey).toBe('[REDACTED_SECRET]');
    expect(redacted.nested.access_token).toBe('[REDACTED_SECRET]');
    expect(redacted.nested.custom_javascript).toBe('[REDACTED_CUSTOM_JS length=22]');
  });
});
