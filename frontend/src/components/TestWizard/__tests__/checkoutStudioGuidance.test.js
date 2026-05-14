import {
  getCheckoutStudioStepForMode,
  getCheckoutStudioStepIssueCounts,
  getCheckoutStudioNextAction,
  getCheckoutStudioModeIssueCounts,
  getCheckoutStudioReadiness,
} from '../checkout/checkoutStudioReadiness';

describe('checkoutStudioGuidance', () => {
  it('blocks manual add-to-cart product lists without merchandise IDs', () => {
    const readiness = getCheckoutStudioReadiness({
      checkoutPhase: 'experience',
      variantIndex: 1,
      variant: {
        name: 'Treatment',
        config: {
          checkout_sections: [
            {
              id: 'products',
              type: 'product_list',
              enabled: true,
              props: {
                title: 'Recommended add-ons',
                product_action: 'add_to_cart',
                product_source_mode: 'manual',
                product_items: [{ title: 'Warranty' }],
              },
            },
          ],
        },
      },
    });

    expect(readiness.status).toBe('blocked');
    expect(readiness.blockerCount).toBeGreaterThan(0);
    expect(readiness.issues.some(issue => issue.scope === 'product')).toBe(true);
  });

  it('marks payment-method variants without targets as blocked', () => {
    const readiness = getCheckoutStudioReadiness({
      checkoutPhase: 'payment_method',
      variantIndex: 1,
      variant: {
        name: 'Treatment',
        config: {},
      },
    });

    expect(readiness.status).toBe('blocked');
    expect(readiness.nextAction).toContain('payment method names');
  });

  it('maps readiness issues to phase-aware rail counts', () => {
    const readiness = {
      issues: [
        { severity: 'blocker', scope: 'surface' },
        { severity: 'blocker', scope: 'product' },
        { severity: 'warning', scope: 'runtime' },
      ],
    };

    expect(getCheckoutStudioModeIssueCounts(readiness, 'experience')).toMatchObject({
      experience: 1,
      products: 2,
      payment: 0,
      preview: 3,
    });
    expect(getCheckoutStudioModeIssueCounts(readiness, 'payment_method')).toMatchObject({
      experience: 0,
      products: 2,
      payment: 1,
      preview: 3,
    });
  });

  it('keeps collection and cart-related dependencies visible as runtime issues', () => {
    const readiness = getCheckoutStudioReadiness({
      checkoutPhase: 'experience',
      variantIndex: 1,
      variant: {
        name: 'Treatment',
        config: {
          checkout_sections: [
            {
              id: 'collection-products',
              type: 'product_list',
              enabled: true,
              props: {
                title: 'From collection',
                product_source_mode: 'collection',
                product_items: [{ title: 'Placeholder' }],
              },
            },
            {
              id: 'cart-products',
              type: 'product_list',
              enabled: true,
              props: {
                title: 'Cart companions',
                product_source_mode: 'cart_related',
              },
            },
          ],
        },
      },
    });

    expect(readiness.issues.some(issue => issue.message.includes('collection hydration'))).toBe(
      true
    );
    expect(readiness.issues.some(issue => issue.message.includes('shopper cart'))).toBe(true);
    expect(readiness.warningCount).toBeGreaterThan(0);
  });

  it('returns the same next action contract for table, command header, and footer', () => {
    expect(
      getCheckoutStudioNextAction(
        {
          manualAddNeedsIds: true,
          manualAddNeedsIdsSectionIndex: 2,
          readiness: { status: 'blocked' },
        },
        'experience'
      )
    ).toMatchObject({
      label: 'Fix product IDs',
      mode: 'products',
      step: 'build',
      substep: 'products',
      sectionIndex: 2,
      field: 'product_items',
    });

    expect(
      getCheckoutStudioNextAction(
        {
          paymentMethodCount: 0,
          readiness: { status: 'blocked' },
        },
        'payment_method'
      )
    ).toMatchObject({
      label: 'Add payment targets',
      mode: 'payment',
      step: 'build',
      substep: 'payment',
    });
  });

  it('maps legacy checkout modes into simplified studio steps', () => {
    expect(getCheckoutStudioStepForMode('overview')).toBe('plan');
    expect(getCheckoutStudioStepForMode('surface')).toBe('plan');
    expect(getCheckoutStudioStepForMode('products')).toBe('build');
    expect(getCheckoutStudioStepForMode('payment')).toBe('build');
    expect(getCheckoutStudioStepForMode('preview')).toBe('verify');
  });

  it('aggregates legacy issue counts into Plan, Build, and Verify steps', () => {
    const readiness = {
      issues: [
        { severity: 'blocker', scope: 'surface' },
        { severity: 'warning', scope: 'product' },
        { severity: 'info', scope: 'runtime' },
      ],
    };

    expect(getCheckoutStudioStepIssueCounts(readiness, 'experience')).toMatchObject({
      plan: 0,
      build: 3,
      verify: 3,
    });
  });
});
