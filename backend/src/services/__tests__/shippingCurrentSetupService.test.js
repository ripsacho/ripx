jest.mock('../shopifyService', () => ({
  requestAdminGraphql: jest.fn(),
  requestAdminRest: jest.fn(),
}));

const {
  buildShippingCurrentSetupReport,
  buildCurrentShippingSummary,
  parseGraphqlDeliveryProfiles,
  parseRestShippingZones,
} = require('../shippingCurrentSetupService');
const shopifyService = require('../shopifyService');

describe('shippingCurrentSetupService', () => {
  it('parses Shopify delivery profile manual rates', () => {
    const parsed = parseGraphqlDeliveryProfiles({
      data: {
        deliveryProfiles: {
          edges: [
            {
              node: {
                id: 'gid://shopify/DeliveryProfile/1',
                name: 'General profile',
                default: true,
                profileLocationGroups: [
                  {
                    locationGroup: {
                      id: 'gid://shopify/DeliveryLocationGroup/1',
                    },
                    locationGroupZones: {
                      edges: [
                        {
                          node: {
                            zone: {
                              id: 'gid://shopify/DeliveryZone/1',
                              name: 'United States',
                              countries: [{ code: { countryCode: 'US' }, name: 'United States' }],
                            },
                            methodDefinitions: {
                              edges: [
                                {
                                  node: {
                                    id: 'gid://shopify/DeliveryMethodDefinition/1',
                                    name: 'Standard',
                                    active: true,
                                    rateProvider: {
                                      __typename: 'DeliveryRateDefinition',
                                      id: 'gid://shopify/DeliveryRateDefinition/1',
                                      price: { amount: '7.5', currencyCode: 'USD' },
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(parsed.rates).toHaveLength(1);
    expect(parsed.rates[0]).toMatchObject({
      name: 'Standard',
      amount: 7.5,
      formatted_amount: 'USD 7.50',
      profile_name: 'General profile',
      profile_location_group_id: 'gid://shopify/DeliveryLocationGroup/1',
      zone_name: 'United States',
      method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1',
      rate_provider_type: 'DeliveryRateDefinition',
      rate_provider_id: 'gid://shopify/DeliveryRateDefinition/1',
      countries: ['US'],
    });
  });

  it('parses Shopify delivery participant carrier-service rates', () => {
    const parsed = parseGraphqlDeliveryProfiles({
      data: {
        deliveryProfiles: {
          edges: [
            {
              node: {
                id: 'gid://shopify/DeliveryProfile/1',
                name: 'General profile',
                default: true,
                profileLocationGroups: [
                  {
                    locationGroup: { id: 'gid://shopify/DeliveryLocationGroup/1' },
                    locationGroupZones: {
                      edges: [
                        {
                          node: {
                            zone: {
                              id: 'gid://shopify/DeliveryZone/1',
                              name: 'International',
                              countries: [{ code: 'GB', name: 'United Kingdom' }],
                            },
                            methodDefinitions: {
                              edges: [
                                {
                                  node: {
                                    id: 'gid://shopify/DeliveryMethodDefinition/2',
                                    name: 'RipX Shipping Carrier test Variant A',
                                    active: true,
                                    rateProvider: {
                                      __typename: 'DeliveryParticipant',
                                      id: 'gid://shopify/DeliveryParticipant/1',
                                      adaptToNewServicesFlag: true,
                                      fixedFee: null,
                                      carrierService: {
                                        id: 'gid://shopify/DeliveryCarrierService/1',
                                        name: 'RipX Shipping Carrier test Variant A',
                                        callbackUrl:
                                          'https://example.com/api/track/shipping-carrier-rates',
                                        active: true,
                                        supportsServiceDiscovery: true,
                                      },
                                      participantServices: [
                                        { name: 'RipX Shipping', active: true },
                                      ],
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(parsed.rates[0]).toMatchObject({
      source: 'carrier_or_calculated',
      rate_provider_type: 'DeliveryParticipant',
      delivery_participant_id: 'gid://shopify/DeliveryParticipant/1',
      carrier_service_name: 'RipX Shipping Carrier test Variant A',
      carrier_service_callback_url: 'https://example.com/api/track/shipping-carrier-rates',
      carrier_service_active: true,
      adapt_to_new_services: true,
      participant_services: [{ name: 'RipX Shipping', active: true }],
    });
  });

  it('parses REST shipping zones as fallback', () => {
    const parsed = parseRestShippingZones({
      shipping_zones: [
        {
          id: 11,
          name: 'Domestic',
          countries: [{ code: 'US' }],
          price_based_shipping_rates: [
            { id: 22, name: 'Standard', price: '5.00', currency: 'USD' },
          ],
          weight_based_shipping_rates: [],
          carrier_shipping_rate_providers: [{ id: 33, name: 'Carrier rates' }],
        },
      ],
    });

    expect(parsed.rates).toHaveLength(2);
    expect(parsed.rates[0].amount).toBe(5);
    expect(parsed.rates[1].source).toBe('carrier_or_calculated');
  });

  it('infers baseline only when there is one clear priced flat rate', () => {
    const single = buildCurrentShippingSummary([
      { name: 'Standard', amount: 5, currency: 'USD', active: true },
    ]);
    expect(single.can_infer_single_flat_rate).toBe(true);
    expect(single.inferred_baseline_rate.formatted_amount).toBe('USD 5.00');

    const multiple = buildCurrentShippingSummary([
      { name: 'Standard', amount: 5, currency: 'USD', active: true },
      { name: 'Express', amount: 12, currency: 'USD', active: true },
    ]);
    expect(multiple.can_infer_single_flat_rate).toBe(false);
  });

  it('falls back to shipping zones when delivery profiles return no rates', async () => {
    shopifyService.requestAdminGraphql.mockResolvedValueOnce({
      data: { deliveryProfiles: { edges: [] } },
    });
    shopifyService.requestAdminRest.mockResolvedValueOnce({
      shipping_zones: [
        {
          id: 11,
          name: 'Domestic',
          countries: [{ code: 'US' }],
          price_based_shipping_rates: [
            { id: 22, name: 'Standard', price: '5.00', currency: 'USD' },
          ],
        },
      ],
    });

    const report = await buildShippingCurrentSetupReport('example.myshopify.com', 'token');

    expect(report.source).toBe('shipping_zones');
    expect(report.rates).toHaveLength(1);
    expect(report.summary.can_infer_single_flat_rate).toBe(true);
  });
});
