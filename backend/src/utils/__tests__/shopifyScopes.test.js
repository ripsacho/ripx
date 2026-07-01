const {
  parseShopifyScopes,
  expandGrantedShopifyScopes,
  normalizeGrantedShopifyScopeString,
  missingShopifyScopes,
} = require('../shopifyScopes');

describe('shopifyScopes', () => {
  const required = [
    'read_cart_transforms',
    'read_delivery_customizations',
    'read_discounts',
    'read_payment_customizations',
    'read_products',
    'read_shipping',
    'write_cart_transforms',
    'write_delivery_customizations',
    'write_discounts',
    'write_payment_customizations',
    'write_products',
    'write_shipping',
  ];

  it('treats write scopes as satisfying matching read scopes', () => {
    const granted =
      'write_cart_transforms,write_delivery_customizations,write_discounts,write_payment_customizations,write_products,write_shipping';
    expect(missingShopifyScopes(granted, required)).toEqual([]);
    expect(expandGrantedShopifyScopes(granted)).toEqual(
      expect.arrayContaining(['read_cart_transforms', 'read_products', 'write_products'])
    );
  });

  it('still reports scopes that are genuinely missing', () => {
    expect(missingShopifyScopes('read_products', ['read_products', 'write_products'])).toEqual([
      'write_products',
    ]);
  });

  it('normalizes granted scope strings for persistence', () => {
    expect(normalizeGrantedShopifyScopeString('write_products, read_shipping')).toBe(
      'read_products,read_shipping,write_products'
    );
  });

  it('parses comma and whitespace separated scopes', () => {
    expect(parseShopifyScopes('read_orders, write_products')).toEqual([
      'read_orders',
      'write_products',
    ]);
  });
});
