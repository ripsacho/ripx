/**
 * testType utils – unit tests (pure helpers only)
 *
 * getVariantCount and inferTemplateKeyFromVariants are used by list/detail views.
 */

import { getVariantCount, inferTemplateKeyFromVariants } from '../testType.js';

describe('getVariantCount', () => {
  it('returns 0 for null or undefined', () => {
    expect(getVariantCount(null)).toBe(0);
    expect(getVariantCount(undefined)).toBe(0);
  });

  it('uses variant_count when present and non-negative', () => {
    expect(getVariantCount({ variant_count: 3 })).toBe(3);
    expect(getVariantCount({ variant_count: 0 })).toBe(0);
  });

  it('counts non-null variants when variant_count not set', () => {
    expect(
      getVariantCount({
        variants: [
          { name: 'Control', config: {} },
          { name: 'Variant A', config: {} },
        ],
      })
    ).toBe(2);
    expect(getVariantCount({ variants: [] })).toBe(0);
  });

  it('filters out null/undefined variants', () => {
    expect(
      getVariantCount({
        variants: [{ name: 'A' }, null, { name: 'B' }, undefined],
      })
    ).toBe(2);
  });
});

describe('inferTemplateKeyFromVariants', () => {
  it('returns split-url when variant config has url', () => {
    expect(inferTemplateKeyFromVariants([{ config: { url: 'https://example.com' } }])).toBe(
      'split-url'
    );
  });

  it('returns template when variant config has template', () => {
    expect(inferTemplateKeyFromVariants([{ config: { template: 'product' } }])).toBe('template');
  });

  it('returns shipping from type or config rate', () => {
    expect(inferTemplateKeyFromVariants([], 'shipping')).toBe('shipping');
    expect(inferTemplateKeyFromVariants([{ config: { rate: 5 } }])).toBe('shipping');
  });

  it('returns offer from type or config discount', () => {
    expect(inferTemplateKeyFromVariants([], 'offer')).toBe('offer');
    expect(inferTemplateKeyFromVariants([{ config: { discount_type: 'percent' } }])).toBe('offer');
  });

  it('returns price or pricing from config price', () => {
    expect(inferTemplateKeyFromVariants([{ config: { price: 10 } }], 'price')).toBe('price');
    expect(inferTemplateKeyFromVariants([{ config: { price: 10 } }], 'pricing')).toBe('pricing');
  });

  it('returns onsite-edit when config has code', () => {
    expect(inferTemplateKeyFromVariants([{ config: { code: 'div { }' } }])).toBe('onsite-edit');
  });

  it('returns theme for type content when config has no distinctive key', () => {
    expect(inferTemplateKeyFromVariants([{ config: {} }], 'content')).toBe('theme');
  });

  it('returns null when no inference possible', () => {
    expect(inferTemplateKeyFromVariants([])).toBe(null);
    expect(inferTemplateKeyFromVariants([], '')).toBe(null);
  });
});
