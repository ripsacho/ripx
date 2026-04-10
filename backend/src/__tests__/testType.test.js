/**
 * Unit tests for testType utility
 */

const { inferTemplateKey, enrichGoalWithTemplateKey } = require('../utils/testType');

describe('inferTemplateKey', () => {
  it('returns split-url when variant has url in config', () => {
    const variants = [{ config: { url: 'https://example.com' } }];
    expect(inferTemplateKey(variants, 'content')).toBe('split-url');
  });

  it('returns template when variant has template in config', () => {
    const variants = [{ config: { template: 'product' } }];
    expect(inferTemplateKey(variants, 'content')).toBe('template');
  });

  it('returns shipping when variant has rate in config', () => {
    const variants = [{ config: { rate: 5 } }];
    expect(inferTemplateKey(variants, 'shipping')).toBe('shipping');
  });

  it('returns offer when variant has discount_type in config', () => {
    const variants = [{ config: { discount_type: 'percent', discount_value: 10 } }];
    expect(inferTemplateKey(variants, 'offer')).toBe('offer');
  });

  it('returns price when variant has price in config', () => {
    const variants = [{ config: { price: 10 } }];
    expect(inferTemplateKey(variants, 'price')).toBe('price');
  });

  it('returns theme when type is content and config is empty', () => {
    const variants = [{ config: {} }];
    expect(inferTemplateKey(variants, 'content')).toBe('theme');
  });

  it('returns theme when type is theme', () => {
    const variants = [{ config: {} }];
    expect(inferTemplateKey(variants, 'theme')).toBe('theme');
  });

  it('returns theme when variant has theme-specific config keys', () => {
    const variants = [{ config: { themeMode: 'asset_flag', bodyClass: 'new-theme' } }];
    expect(inferTemplateKey(variants, 'content')).toBe('theme');
  });

  it('returns shipping when type is shipping', () => {
    const variants = [{ config: {} }];
    expect(inferTemplateKey(variants, 'shipping')).toBe('shipping');
  });
});

describe('enrichGoalWithTemplateKey', () => {
  it('does not overwrite existing template_key', () => {
    const test = { goal: { type: 'conversion', template_key: 'split-url' }, variants: [] };
    const result = enrichGoalWithTemplateKey(test);
    expect(result.goal.template_key).toBe('split-url');
  });

  it('overrides wrong template_key when type is shipping', () => {
    const test = {
      goal: { type: 'conversion', template_key: 'price' },
      variants: [{ config: { rate: 5 } }],
      type: 'shipping',
    };
    const result = enrichGoalWithTemplateKey(test);
    expect(result.goal.template_key).toBe('shipping');
  });

  it('overrides wrong template_key when type is price but config has rate (shipping test)', () => {
    const test = {
      goal: { type: 'conversion', template_key: 'price' },
      variants: [{ config: { rate: null } }],
      type: 'price',
    };
    const result = enrichGoalWithTemplateKey(test);
    expect(result.goal.template_key).toBe('shipping');
  });

  it('adds template_key when missing and inferable', () => {
    const test = {
      goal: { type: 'conversion' },
      variants: [{ config: { url: 'https://a.com' } }],
      type: 'content',
    };
    const result = enrichGoalWithTemplateKey(test);
    expect(result.goal.template_key).toBe('split-url');
  });

  it('returns test unchanged when no goal', () => {
    const test = { variants: [] };
    const result = enrichGoalWithTemplateKey(test);
    expect(result).toEqual(test);
  });
});
