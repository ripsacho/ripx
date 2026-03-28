const {
  signPriceAssignment,
  verifyPriceAssignmentSignature,
  shouldRequireSignedAssignment,
} = require('../priceAssignmentSignature');

describe('priceAssignmentSignature', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET = 'sig-secret';
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it('signs and verifies a valid payload', () => {
    const ts = Date.now();
    const sig = signPriceAssignment({
      testId: '11111111-1111-4111-8111-111111111111',
      variantId: 'var-a',
      userId: 'user-1',
      shopDomain: 'test.myshopify.com',
      issuedAtMs: ts,
    });
    const v = verifyPriceAssignmentSignature({
      testId: '11111111-1111-4111-8111-111111111111',
      variantId: 'var-a',
      userId: 'user-1',
      shopDomain: 'test.myshopify.com',
      issuedAtMs: ts,
      signature: sig,
    });
    expect(v.ok).toBe(true);
  });

  it('rejects expired signatures', () => {
    process.env.RIPX_PRICE_ASSIGNMENT_SIGNATURE_TTL_SEC = '1';
    const ts = Date.now() - 5000;
    const sig = signPriceAssignment({
      testId: '11111111-1111-4111-8111-111111111111',
      variantId: 'var-a',
      userId: 'user-1',
      shopDomain: 'test.myshopify.com',
      issuedAtMs: ts,
    });
    const v = verifyPriceAssignmentSignature({
      testId: '11111111-1111-4111-8111-111111111111',
      variantId: 'var-a',
      userId: 'user-1',
      shopDomain: 'test.myshopify.com',
      issuedAtMs: ts,
      signature: sig,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('assignment_signature_expired');
  });

  it('requires signature in strict mode', () => {
    process.env.RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT = 'true';
    const v = verifyPriceAssignmentSignature({
      testId: '11111111-1111-4111-8111-111111111111',
      variantId: 'var-a',
      userId: 'user-1',
      shopDomain: 'test.myshopify.com',
      issuedAtMs: '',
      signature: '',
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('missing_assignment_signature');
  });

  it('defaults strict mode on in production when env flag is unset', () => {
    delete process.env.RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT;
    process.env.NODE_ENV = 'production';
    expect(shouldRequireSignedAssignment()).toBe(true);
  });

  it('supports explicit strict-mode disable in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT = 'false';
    expect(shouldRequireSignedAssignment()).toBe(false);
  });
});
