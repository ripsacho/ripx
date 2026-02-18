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
        { name: 'A', allocation: 50 },
        { name: 'B', allocation: 50 },
      ],
    };
    const result = validators.validateTestConfig(config);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for missing name', () => {
    const result = validators.validateTestConfig({
      type: 'price',
      variants: [{ name: 'A', allocation: 50 }, { name: 'B', allocation: 50 }],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Test name is required');
  });

  it('returns errors for invalid type', () => {
    const result = validators.validateTestConfig({
      name: 'Test',
      type: 'invalid',
      variants: [{ name: 'A', allocation: 50 }, { name: 'B', allocation: 50 }],
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
