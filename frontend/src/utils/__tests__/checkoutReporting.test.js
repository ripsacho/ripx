import {
  formatCheckoutSectionEventLabel,
  getCheckoutExperienceTestInventory,
  getCheckoutSectionEventContext,
  isCheckoutSectionEventName,
  summarizeCheckoutExperienceInventory,
} from '../checkoutReporting';

describe('checkoutReporting utils', () => {
  it('summarizes checkout experience tests by renderable sections', () => {
    const inventory = getCheckoutExperienceTestInventory([
      {
        id: 'checkout-1',
        type: 'checkout',
        name: 'Checkout reassurance',
        status: 'draft',
        goal: { checkout_phase: 'experience' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: {
              checkout_placement: 'purchase.checkout.block.render',
              checkout_sections: [
                {
                  id: 'trust-box',
                  type: 'trust_box',
                  enabled: true,
                  props: {
                    title: 'Trusted checkout',
                    feature_bullets: ['Encrypted payment', 'Free returns'],
                  },
                },
                {
                  id: 'faq',
                  type: 'hero_notice',
                  enabled: true,
                  props: { message: 'Questions? Support replies 24/7.' },
                },
              ],
            },
          },
        ],
      },
    ]);

    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      actionableVariants: 1,
      totalRenderableSections: 2,
      totalBullets: 2,
      sectionTypes: ['trust_box', 'hero_notice'],
    });

    const summary = summarizeCheckoutExperienceInventory(inventory);
    expect(summary.testCount).toBe(1);
    expect(summary.actionableVariants).toBe(1);
    expect(summary.renderableSections).toBe(2);
    expect(Array.from(summary.sectionTypes)).toEqual(['trust_box', 'hero_notice']);
  });

  it('extracts checkout section context from event metadata', () => {
    const context = getCheckoutSectionEventContext({
      metadata: JSON.stringify({
        checkout_phase: 'experience',
        checkout_section_id: 'trust-box',
        checkout_section_type: 'trust_box',
        offer_code: 'SAVE10',
      }),
    });

    expect(context.checkoutPhase).toBe('experience');
    expect(context.sectionId).toBe('trust-box');
    expect(context.sectionType).toBe('trust_box');
    expect(context.sectionTypeLabel).toBe('Trust Box');
    expect(context.hasSectionContext).toBe(true);
    expect(context.summary).toContain('Trust Box');
    expect(context.summary).toContain('SAVE10');
  });

  it('recognizes built-in checkout section event names', () => {
    expect(isCheckoutSectionEventName('checkout_section_impression')).toBe(true);
    expect(formatCheckoutSectionEventLabel('checkout_section_offer_apply')).toBe(
      'Section offer apply'
    );
    expect(isCheckoutSectionEventName('newsletter_signup')).toBe(false);
  });
});
