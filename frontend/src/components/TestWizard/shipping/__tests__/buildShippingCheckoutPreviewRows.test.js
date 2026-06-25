import { buildShippingCheckoutPreviewRows } from '../buildShippingCheckoutPreviewRows';

describe('buildShippingCheckoutPreviewRows', () => {
  it('returns a single control baseline row for control variants', () => {
    const result = buildShippingCheckoutPreviewRows({ usesControlView: true });
    expect(result.checkoutRows).toHaveLength(1);
    expect(result.checkoutRows[0]).toMatchObject({
      tone: 'native',
      title: 'Shopify live shipping method',
    });
  });

  it('keeps native methods visible when no hide targets are selected', () => {
    const result = buildShippingCheckoutPreviewRows({
      shippingCurrentRates: [{ name: 'Standard', amount: 5, currency: 'USD' }],
      activeConfiguredRates: [{ name: 'Express', amount: 12, currency: 'USD' }],
      checkoutPreviewPromiseLabel: '2-3 business days',
    });

    expect(result.checkoutRows).toHaveLength(2);
    expect(result.checkoutRows[0]).toMatchObject({ title: 'Standard', tone: 'native' });
    expect(result.checkoutRows[1]).toMatchObject({ title: 'Express', tone: 'variant' });
    expect(result.previewCaption).toMatch(/No Step 2 hide targets/i);
  });

  it('hides selected native methods from the preview stack', () => {
    const result = buildShippingCheckoutPreviewRows({
      shippingCurrentRates: [
        { name: 'Standard', amount: 5, currency: 'USD' },
        { name: 'Express', amount: 9, currency: 'USD' },
      ],
      activeDeliveryMethodNames: ['Standard'],
      activeConfiguredRates: [{ name: 'RipX Economy', amount: 4, currency: 'USD' }],
    });

    expect(result.checkoutRows.map(row => row.title)).toEqual(['Express', 'RipX Economy']);
    expect(result.previewCaption).toMatch(/Step 2 hides Standard/i);
  });

  it('hides every selected native method using fuzzy title matching', () => {
    const result = buildShippingCheckoutPreviewRows({
      shippingCurrentRates: [
        { name: 'Standard Shipping', amount: 5, currency: 'USD' },
        { name: 'Express Shipping', amount: 9, currency: 'USD' },
        { name: 'Economy', amount: 3, currency: 'USD' },
      ],
      activeDeliveryMethodNames: ['Standard Shipping', 'Express Shipping'],
      activeConfiguredRates: [{ name: 'RipX Economy', amount: 4, currency: 'USD' }],
    });

    expect(result.checkoutRows.map(row => row.title)).toEqual(['Economy', 'RipX Economy']);
    expect(result.previewCaption).toMatch(/Standard Shipping, Express Shipping/);
  });

  it('hides native methods selected by Shopify rate ids', () => {
    const result = buildShippingCheckoutPreviewRows({
      shippingCurrentRates: [
        {
          id: 'gid://shopify/DeliveryMethodDefinition/111',
          name: 'Carrier Calculated',
          amount: 9,
          currency: 'USD',
        },
        { name: 'Economy', amount: 3, currency: 'USD' },
      ],
      activeDeliveryMethodNames: [],
      activeSelectedMethodIds: ['gid://shopify/DeliveryMethodDefinition/111'],
      activeConfiguredRates: [{ name: 'RipX Economy', amount: 4, currency: 'USD' }],
    });

    expect(result.checkoutRows.map(row => row.title)).toEqual(['Economy', 'RipX Economy']);
  });
});
