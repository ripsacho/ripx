import {
  buildDeliveryHideTargetingCodes,
  matchesDeliveryMethodTitle,
  shouldHideNativeShippingRate,
} from '../shippingConfig/deliveryMethodMatching';

describe('deliveryMethodMatching', () => {
  it('matches checkout titles with normalized shipping/delivery suffixes', () => {
    expect(matchesDeliveryMethodTitle('Standard Shipping', ['Standard'])).toBe(true);
    expect(matchesDeliveryMethodTitle('Express Delivery', ['Express Shipping'])).toBe(true);
  });

  it('builds hide targeting codes from names and scoped ids', () => {
    expect(
      buildDeliveryHideTargetingCodes(['Standard Shipping'], {
        selected_rate_ids: ['gid://shopify/DeliveryMethodDefinition/12345'],
      })
    ).toEqual(expect.arrayContaining(['Standard Shipping', 'standard_shipping', '12345']));
  });

  it('hides native rates by Shopify ids even when names differ', () => {
    expect(
      shouldHideNativeShippingRate(
        {
          id: 'gid://shopify/DeliveryMethodDefinition/999',
          name: 'Carrier Calculated',
        },
        {
          hideNames: [],
          hideIds: ['gid://shopify/DeliveryMethodDefinition/999'],
        }
      )
    ).toBe(true);
  });
});
