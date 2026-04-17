/**
 * Test Wizard configuration
 *
 * Template definitions and categories for the create/edit test wizard.
 * Extracted from TestWizard.jsx to reduce file size and allow reuse.
 */

export const TEST_TEMPLATES = {
  price: {
    name: 'Price Test',
    icon: '💰',
    description:
      'Test direct price changes (lower or higher) per cohort. PDP display only (product targets). Use fixed price, $ off/on, or % off/on. Run 2–4 weeks with 200+ conversions per variant for significance. Use Revenue or Profit as primary metric (Goal step). Use Offer Test for promo-style discounts.',
    defaultConfig: {
      type: 'price',
      variants: [
        {
          name: 'Control',
          allocation: 50,
          config: { price: null, priceApplicationMethod: 'direct_price_override' },
        },
        {
          name: 'Variant A',
          allocation: 50,
          config: { price: null, priceApplicationMethod: 'direct_price_override' },
        },
      ],
    },
  },
  pricing: {
    name: 'Pricing',
    icon: '💰',
    description:
      'Same PDP price display as Price Test. Target **products** (one or many); collection-only targets do not drive PDP price — see banner.',
    defaultConfig: {
      type: 'price',
      variants: [
        {
          name: 'Control',
          allocation: 50,
          config: { price: null, priceApplicationMethod: 'direct_price_override' },
        },
        {
          name: 'Variant A',
          allocation: 50,
          config: { price: null, priceApplicationMethod: 'direct_price_override' },
        },
      ],
    },
  },
  content: {
    name: 'Content Test',
    icon: '📝',
    description: 'Test headlines, descriptions, and messaging',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Variant A', allocation: 50, config: {} },
      ],
    },
  },
  'onsite-edit': {
    name: 'Onsite Edit',
    icon: '✏️',
    description:
      'Edit or hide page elements like text, images, or sections without changing your theme.',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Variant A', allocation: 50, config: {} },
      ],
    },
  },
  'split-url': {
    name: 'Split URL',
    icon: '🔀',
    description:
      'Send visitors to alternate URLs per variant (e.g. different landing pages). The storefront redirects to the variant URL when the test matches. Use full same-origin URLs.',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: { url: '' } },
        { name: 'Variant A', allocation: 50, config: { url: '' } },
      ],
    },
  },
  template: {
    name: 'Template',
    icon: '📄',
    description:
      'Compare different theme templates per variant. Configure template handle plus optional theme/section targeting for internal implementation, or use Split URL to route users to URLs that render each template.',
    defaultConfig: {
      type: 'theme',
      variants: [
        {
          name: 'Control',
          allocation: 50,
          config: {
            themeMode: 'template_switch',
            template: '',
            themeTemplateHandle: '',
            themeId: '',
            sectionId: '',
            bodyClass: '',
            url: '',
          },
        },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            themeMode: 'template_switch',
            template: '',
            themeTemplateHandle: '',
            themeId: '',
            sectionId: '',
            bodyClass: '',
            url: '',
          },
        },
      ],
    },
  },
  theme: {
    name: 'Theme',
    icon: '🎨',
    description: 'Test theme redesigns, new navigation, or impact of adding an app.',
    defaultConfig: {
      type: 'theme',
      variants: [
        {
          name: 'Control',
          allocation: 50,
          config: {
            themeMode: 'asset_flag',
            bodyClass: '',
            themeId: '',
            sectionId: '',
            template: '',
            themeTemplateHandle: '',
            url: '',
          },
        },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            themeMode: 'asset_flag',
            bodyClass: '',
            themeId: '',
            sectionId: '',
            template: '',
            themeTemplateHandle: '',
            url: '',
          },
        },
      ],
    },
  },
  shipping: {
    name: 'Shipping Test',
    icon: '🚚',
    description:
      'Test shipping strategies (flat rates, thresholds, free shipping, or carrier-quote paths). RipX tracks assignment and provides execution diagnostics for Shopify capability paths.',
    defaultConfig: {
      type: 'shipping',
      variants: [
        { name: 'Control', allocation: 50, config: { strategy: 'control', currency: 'USD' } },
        {
          name: 'Variant A',
          allocation: 50,
          config: { strategy: 'flat_rate', amount: 4.99, currency: 'USD' },
        },
      ],
    },
  },
  offer: {
    name: 'Offer Test',
    icon: '🎁',
    description:
      'Test discount or free-shipping offers per variant. Use this for promo campaigns (instead of Price Test). RipX assigns the variant; apply the discount at checkout via a Discount Function or discount codes.',
    defaultConfig: {
      type: 'offer',
      variants: [
        {
          name: 'Control',
          allocation: 50,
          config: { discount_type: 'percent', discount_value: null },
        },
        {
          name: 'Variant A',
          allocation: 50,
          config: { discount_type: 'percent', discount_value: null },
        },
      ],
    },
  },
  checkout: {
    name: 'Checkout Test',
    icon: '🛒',
    description:
      'Test checkout experience blocks first, then expand into payment-method or delivery-method experiments. RipX assigns the variant for analytics and can render checkout content through the Checkout UI Extension.',
    defaultConfig: {
      type: 'checkout',
      goal: {
        checkout_phase: 'experience',
      },
      variants: [
        {
          name: 'Control',
          allocation: 50,
          config: {
            checkout_placement: 'purchase.checkout.block.render',
            checkout_sections: [],
          },
        },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            checkout_placement: 'purchase.checkout.block.render',
            checkout_sections: [
              {
                id: 'hero-notice-1',
                type: 'hero_notice',
                enabled: true,
                order: 0,
                props: {
                  title: 'Checkout with confidence',
                  message: 'Show reassurance, urgency, or offer messaging directly in checkout.',
                  cta_label: 'Continue securely',
                  badge_text: 'RipX test',
                  layout: 'banner',
                  tone: 'success',
                  cta_kind: 'track',
                  feature_bullets: ['Secure checkout', 'Fast support'],
                },
              },
            ],
          },
        },
      ],
    },
  },
  combination: {
    name: 'Combination Test',
    icon: '🔬',
    description:
      'Test multiple factors together (e.g. price + shipping) for interaction effects. Each factor follows the same rules as single-factor tests (price: display + cart attr; shipping/offer: need Functions).',
    defaultConfig: {
      type: 'combination',
      variants: [
        { name: 'Control + Control', allocation: 25, config: { price: null, rate: null } },
        { name: 'Price A + Control', allocation: 25, config: { price: null, rate: null } },
        { name: 'Control + Shipping A', allocation: 25, config: { price: null, rate: null } },
        { name: 'Price A + Shipping A', allocation: 25, config: { price: null, rate: null } },
      ],
    },
  },
};

export const TEST_TYPE_CATEGORIES = {
  content: {
    title: 'Content Tests',
    description: 'Test visual and content changes',
    types: [
      {
        key: 'onsite-edit',
        name: 'Onsite Edit',
        description:
          'Edit or hide page elements like text, images, or sections without changing your theme.',
        icon: '✏️',
      },
      {
        key: 'split-url',
        name: 'Split URL',
        description: 'Send visitors to alternate URLs to test page-level changes.',
        icon: '🔀',
      },
      {
        key: 'template',
        name: 'Template',
        description: 'Compare and test different homepage, product, and collections templates.',
        icon: '📄',
      },
      {
        key: 'theme',
        name: 'Theme',
        description: 'Test theme redesigns, new navigation, or impact of adding an app.',
        icon: '🎨',
      },
    ],
  },
  profit: {
    title: 'Profit Tests',
    description: 'Test changes that directly impact revenue',
    types: [
      {
        key: 'pricing',
        name: 'Pricing',
        description: 'Test price points on one product, multiple products, or entire collections.',
        icon: '💰',
      },
      {
        key: 'shipping',
        name: 'Shipping',
        description: 'Explore different shipping rates and free shipping thresholds.',
        icon: '🚚',
      },
      {
        key: 'offer',
        name: 'Offer',
        description: 'Compare percentage discounts, dollar-off amounts, or tiered incentives.',
        icon: '🎁',
      },
      {
        key: 'checkout',
        name: 'Checkout Test',
        description:
          'Try checkout customizations like trust badges, guarantees, and custom images.',
        icon: '🛒',
      },
      {
        key: 'combination',
        name: 'Combination Test',
        description:
          'Test multiple variables together (e.g., price + shipping) for interaction effects.',
        icon: '🔬',
      },
    ],
  },
};

/**
 * Step IDs for the wizard (depends on whether template step is shown).
 * Use getStepIds(showTemplateStep) for targetingStepId, goalStepId, codeStepId, reviewStepId, trafficStepId.
 */
export function getStepIds(showTemplateStep) {
  if (showTemplateStep) {
    return {
      template: 1,
      traffic: 2,
      targeting: 3,
      goal: 4,
      code: 5,
      review: 6,
    };
  }
  return {
    traffic: 1,
    targeting: 2,
    goal: 3,
    code: 4,
    review: 5,
  };
}

/**
 * Build the steps array for the wizard (title/description per step).
 * @param {boolean} showTemplateStep
 * @param {'create'|'edit'} mode
 * @returns {{ id: number, title: string, description: string }[]}
 */
export function buildWizardSteps(showTemplateStep, mode) {
  const reviewTitle = mode === 'create' ? 'Review & Create' : 'Review & Save';
  if (showTemplateStep) {
    return [
      { id: 1, title: 'Select Test Type', description: 'Choose a test template' },
      { id: 2, title: 'Traffic Allocation', description: 'Set traffic distribution' },
      {
        id: 3,
        title: 'Targeting & Segmentation',
        description: 'Scope, device, audience, holdout',
      },
      { id: 4, title: 'Goal & Metrics', description: 'Define success metric and conversion' },
      {
        id: 5,
        title: 'Variant Configuration',
        description: 'Configure each variant (code, URLs, etc.)',
      },
      { id: 6, title: reviewTitle, description: 'Review and confirm' },
    ];
  }
  return [
    { id: 1, title: 'Traffic Allocation', description: 'Set traffic distribution' },
    {
      id: 2,
      title: 'Targeting & Segmentation',
      description: 'Scope, device, audience, holdout',
    },
    { id: 3, title: 'Goal & Metrics', description: 'Define success metric and conversion' },
    {
      id: 4,
      title: 'Variant Configuration',
      description: 'Configure each variant (code, URLs, etc.)',
    },
    { id: 5, title: reviewTitle, description: 'Review and confirm' },
  ];
}
