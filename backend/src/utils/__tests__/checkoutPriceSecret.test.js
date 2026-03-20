const { checkoutPriceSecretsMatch } = require('../checkoutPriceSecret');

describe('checkoutPriceSecretsMatch', () => {
  it('returns true for identical secrets', () => {
    expect(checkoutPriceSecretsMatch('abc', 'abc')).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(checkoutPriceSecretsMatch('abc', 'abcd')).toBe(false);
    expect(checkoutPriceSecretsMatch('abcd', 'abc')).toBe(false);
  });

  it('returns false for wrong secret same length', () => {
    expect(checkoutPriceSecretsMatch('secret-one', 'secret-two')).toBe(false);
  });

  it('returns false when either side empty', () => {
    expect(checkoutPriceSecretsMatch('', 'x')).toBe(false);
    expect(checkoutPriceSecretsMatch('x', '')).toBe(false);
    expect(checkoutPriceSecretsMatch('', '')).toBe(false);
  });

  it('is sensitive to full string (not prefix)', () => {
    expect(checkoutPriceSecretsMatch('longer-token-here', 'longer-token-herX')).toBe(false);
  });
});
