/**
 * Unit tests for validators utility
 */

const validators = require('../utils/validators');

describe('validators.isValidEmail', () => {
  it('returns true for valid emails', () => {
    expect(validators.isValidEmail('user@example.com')).toBe(true);
    expect(validators.isValidEmail('test.user+tag@domain.co.uk')).toBe(true);
  });

  it('returns false for invalid emails', () => {
    expect(validators.isValidEmail('invalid')).toBe(false);
    expect(validators.isValidEmail('missing@domain')).toBe(false);
    expect(validators.isValidEmail('')).toBe(false);
  });
});

describe('validators.isValidUrl', () => {
  it('returns true for valid URLs', () => {
    expect(validators.isValidUrl('https://example.com')).toBe(true);
    expect(validators.isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('returns false for invalid URLs', () => {
    expect(validators.isValidUrl('not-a-url')).toBe(false);
    expect(validators.isValidUrl('')).toBe(false);
  });
});

describe('validators.isValidDomain', () => {
  it('returns true for valid standalone domains', () => {
    expect(validators.isValidDomain('example.com')).toBe(true);
    expect(validators.isValidDomain('www.example.com')).toBe(true);
    expect(validators.isValidDomain('https://example.com')).toBe(true);
    expect(validators.isValidDomain('sub.domain.co.uk')).toBe(true);
  });

  it('returns false for invalid domains', () => {
    expect(validators.isValidDomain('')).toBe(false);
    expect(validators.isValidDomain(null)).toBe(false);
    expect(validators.isValidDomain('invalid')).toBe(false);
    expect(validators.isValidDomain('.example.com')).toBe(false);
    expect(validators.isValidDomain('a'.repeat(254))).toBe(false);
  });
});

describe('validators.isValidShopDomain', () => {
  it('returns true for valid Shopify domains', () => {
    expect(validators.isValidShopDomain('myshop.myshopify.com')).toBe(true);
    expect(validators.isValidShopDomain('test-store-123.myshopify.com')).toBe(true);
  });

  it('returns false for invalid domains', () => {
    expect(validators.isValidShopDomain('example.com')).toBe(false);
    expect(validators.isValidShopDomain('.myshopify.com')).toBe(false);
    expect(validators.isValidShopDomain('')).toBe(false);
  });
});

describe('validators.isValidPrice', () => {
  it('returns true for valid prices', () => {
    expect(validators.isValidPrice(0)).toBe(true);
    expect(validators.isValidPrice(29.99)).toBe(true);
  });

  it('returns false for invalid prices', () => {
    expect(validators.isValidPrice(-1)).toBe(false);
    expect(validators.isValidPrice(NaN)).toBe(false);
    expect(validators.isValidPrice('29.99')).toBe(false);
  });
});

describe('validators.isValidPercentage', () => {
  it('returns true for 0-100', () => {
    expect(validators.isValidPercentage(0)).toBe(true);
    expect(validators.isValidPercentage(50)).toBe(true);
    expect(validators.isValidPercentage(100)).toBe(true);
  });

  it('returns false for out of range', () => {
    expect(validators.isValidPercentage(-1)).toBe(false);
    expect(validators.isValidPercentage(101)).toBe(false);
  });
});

describe('validators.isValidUUID', () => {
  it('returns true for valid v4-style UUIDs', () => {
    expect(validators.isValidUUID('a1b2c3d4-e5f6-4789-a012-3456789abcde')).toBe(true);
    expect(validators.isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(validators.isValidUUID('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')).toBe(true);
  });

  it('returns false for non-UUID strings', () => {
    expect(validators.isValidUUID('not-a-uuid')).toBe(false);
    expect(validators.isValidUUID('a1b2c3d4-e5f6-4789-a012')).toBe(false);
    expect(validators.isValidUUID('a1b2c3d4e5f64789a0123456789abcde')).toBe(false);
    expect(validators.isValidUUID('')).toBe(false);
    expect(validators.isValidUUID(null)).toBe(false);
    expect(validators.isValidUUID(undefined)).toBe(false);
  });
});

describe('validators.validateDomainForInput', () => {
  it('returns valid and normalized for good domains', () => {
    const r = validators.validateDomainForInput('  Example.COM  ');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('example.com');
  });

  it('returns error for empty or invalid', () => {
    expect(validators.validateDomainForInput('').valid).toBe(false);
    expect(validators.validateDomainForInput('invalid').valid).toBe(false);
    expect(validators.validateDomainForInput('localhost').valid).toBe(false);
  });
});

describe('validators.sanitizeString', () => {
  it('trims and removes angle brackets', () => {
    expect(validators.sanitizeString('  hello  ')).toBe('hello');
    expect(validators.sanitizeString('<script>')).toBe('script');
  });

  it('returns empty string for non-string input', () => {
    expect(validators.sanitizeString(null)).toBe('');
    expect(validators.sanitizeString(123)).toBe('');
  });
});

describe('validators.validateTestConfig', () => {
  it('returns valid for correct config', () => {
    const config = {
      name: 'Test',
      type: 'price',
      variants: [
        { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: '' } },
        { name: 'Variant A', allocation: 50, config: { priceMode: 'percent', pricePercent: 10 } },
      ],
    };
    const result = validators.validateTestConfig(config);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for price test when no non-control variant has price configured', () => {
    const result = validators.validateTestConfig({
      name: 'Test',
      type: 'price',
      variants: [
        { name: 'Control', allocation: 50, config: { priceMode: 'fixed' } },
        { name: 'Variant A', allocation: 50, config: { priceMode: 'fixed', price: '' } },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Price test') && e.includes('non-control'))).toBe(
      true
    );
  });

  it('returns error when Native Variant Price has no mapped Shopify variant ID', () => {
    const result = validators.validateTestConfig({
      name: 'Test',
      type: 'price',
      variants: [
        { name: 'Control', allocation: 50, config: { priceMode: 'fixed' } },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            priceMode: 'fixed',
            price: 39,
            priceApplicationMethod: 'native_variant_price',
          },
        },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(
      result.errors.some(
        e => e.includes('Native Variant Price') && e.includes('mapped Shopify variant ID')
      )
    ).toBe(true);
  });

  it('returns error when Discounted Checkout Price is used for a price increase', () => {
    const result = validators.validateTestConfig({
      name: 'Test',
      type: 'price',
      variants: [
        { name: 'Control', allocation: 50, config: { priceMode: 'fixed' } },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            priceMode: 'amount',
            priceDelta: 5,
            priceApplicationMethod: 'discounted_checkout_price',
          },
        },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(
      result.errors.some(
        e => e.includes('Discounted Checkout Price') && e.includes('only supports lower prices')
      )
    ).toBe(true);
  });

  it('allows Direct Price Override when the variant lowers price (manual method)', () => {
    const result = validators.validateTestConfig({
      name: 'Test',
      type: 'price',
      variants: [
        { name: 'Control', allocation: 50, config: { priceMode: 'fixed' } },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            priceMode: 'amount',
            priceDelta: -5,
            priceApplicationMethod: 'direct_price_override',
          },
        },
      ],
    });
    expect(result.isValid).toBe(true);
    expect(
      result.errors.some(
        e => e.includes('Direct Price Override') && e.includes('hardened for price increases')
      )
    ).toBe(false);
  });

  it('returns errors for missing name', () => {
    const result = validators.validateTestConfig({
      type: 'price',
      variants: [
        { name: 'A', allocation: 50 },
        { name: 'B', allocation: 50 },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Test name is required');
  });

  it('returns errors for invalid type', () => {
    const result = validators.validateTestConfig({
      name: 'Test',
      type: 'invalid',
      variants: [
        { name: 'A', allocation: 50 },
        { name: 'B', allocation: 50 },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Test type must be one of'))).toBe(true);
  });

  it('returns errors when allocations do not sum to 100', () => {
    const result = validators.validateTestConfig({
      name: 'Test',
      type: 'price',
      variants: [
        { name: 'A', allocation: 30 },
        { name: 'B', allocation: 50 },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Variant allocations must sum to 100%');
  });
});
