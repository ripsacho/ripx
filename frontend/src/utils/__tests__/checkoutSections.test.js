import {
  createEmptyCheckoutSection,
  getActionableCheckoutSections,
  getNormalizedCheckoutExperienceConfig,
  syncLegacyCheckoutExperienceFields,
} from '../checkoutSections';

describe('checkoutSections utils', () => {
  it('normalizes legacy checkout fields into a single section', () => {
    const normalized = getNormalizedCheckoutExperienceConfig({
      checkout_title: 'Checkout with confidence',
      checkout_message: 'Secure payment and free returns.',
      checkout_feature_bullets: ['Encrypted checkout', '24/7 support'],
    });

    expect(normalized.checkout_sections).toHaveLength(1);
    expect(normalized.checkout_sections[0]).toMatchObject({
      type: 'hero_notice',
      props: {
        title: 'Checkout with confidence',
        message: 'Secure payment and free returns.',
        feature_bullets: ['Encrypted checkout', '24/7 support'],
      },
    });
  });

  it('returns actionable structured sections only when enabled and populated', () => {
    const actionable = getActionableCheckoutSections({
      checkout_sections: [
        createEmptyCheckoutSection(0),
        {
          id: 'trust-box',
          type: 'trust_box',
          enabled: true,
          props: { title: 'Trusted by 12,000 customers' },
        },
        {
          id: 'disabled-box',
          type: 'guarantee_box',
          enabled: false,
          props: { title: 'Disabled section' },
        },
      ],
    });

    expect(actionable).toHaveLength(1);
    expect(actionable[0].type).toBe('trust_box');
  });

  it('syncs legacy root fields from the first actionable section', () => {
    const synced = syncLegacyCheckoutExperienceFields({
      checkout_sections: [
        {
          id: 'trust-box',
          type: 'trust_box',
          enabled: true,
          props: {
            title: 'Trusted checkout',
            message: 'Every order is protected.',
            cta_label: 'Continue',
            tone: 'info',
            layout: 'stacked',
            cta_kind: 'track',
            feature_bullets: ['Buyer protection'],
          },
        },
      ],
    });

    expect(synced.checkout_title).toBe('Trusted checkout');
    expect(synced.checkout_message).toBe('Every order is protected.');
    expect(synced.checkout_cta_label).toBe('Continue');
    expect(synced.checkout_tone).toBe('info');
    expect(synced.checkout_layout).toBe('stacked');
    expect(synced.checkout_feature_bullets).toEqual(['Buyer protection']);
  });
});
