import {
  getWizardStepErrors,
  partitionTargetingStepErrors,
  getTargetingCoachHints,
} from '../wizardValidation';
import { getStepIds } from '../testWizardConfig';

describe('wizardValidation', () => {
  const stepIdsWithTemplate = getStepIds(true);
  const stepIdsNoTemplate = getStepIds(false);

  describe('getWizardStepErrors', () => {
    describe('template step (stepId 1, showTemplateStep true)', () => {
      it('returns error when name is missing', () => {
        const errors = getWizardStepErrors(1, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {},
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors).toContain('Test name is required.');
      });

      it('returns error when selectedTemplate is missing', () => {
        const errors = getWizardStepErrors(1, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { name: 'My Test' },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: '',
        });
        expect(errors).toContain('Select a test type to continue.');
      });

      it('returns no errors when name and template are set', () => {
        const errors = getWizardStepErrors(1, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { name: 'My Test' },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors).toHaveLength(0);
      });

      it('returns no errors for unknown stepId (no rules apply)', () => {
        const errors = getWizardStepErrors(99, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {},
          showTemplateStep: true,
        });
        expect(errors).toHaveLength(0);
      });
    });

    describe('goal step', () => {
      it('returns error when name is missing', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { goal: { metric: 'revenue' } },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('Test name is required.');
      });

      it('returns error when goal.metric is missing', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { name: 'Test', goal: {} },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain(
          'Select a success metric (Revenue, Conversion, RPV, PPV, or AOV).'
        );
      });

      it('returns error for COGS percentage out of range', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            name: 'Test',
            goal: { metric: 'revenue', cogs: { enabled: true, type: 'percentage', value: 150 } },
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('COGS percentage must be between 0 and 100.');
      });

      it('returns error for COGS fixed_per_order negative', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            name: 'Test',
            goal: {
              metric: 'revenue',
              cogs: { enabled: true, type: 'fixed_per_order', value: -1 },
            },
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('COGS per order must be 0 or greater.');
      });

      it('returns no errors when goal step is valid', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { name: 'Test', goal: { metric: 'revenue' } },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toHaveLength(0);
      });

      it('requires COGS when PPV is the primary metric', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { name: 'Test', goal: { metric: 'profit_per_visitor' } },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('Enable COGS to use Profit per visitor (PPV).');
      });

      it('rejects a secondary business metric that matches the primary metric', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            name: 'Test',
            goal: { metric: 'revenue', secondary_metric: 'revenue' },
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain(
          'Secondary metric must be different from the primary winner metric.'
        );
      });

      it('validates duplicate and malformed secondary event goals', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            name: 'Test',
            goal: {
              metric: 'revenue',
              secondary: [
                { event_name: 'checkout start', metric_role: 'secondary' },
                { event_name: 'add_to_cart', metric_role: 'secondary' },
                { event_name: 'add_to_cart', metric_role: 'secondary' },
              ],
            },
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain(
          'Goal 1: event name must use lowercase letters, numbers, and underscores only.'
        );
        expect(errors).toContain('Goal 3: duplicate event goal "add_to_cart" is already selected.');
      });

      it('validates guardrail thresholds', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            name: 'Test',
            goal: {
              metric: 'revenue',
              secondary: [
                {
                  event_name: 'checkout_start',
                  metric_role: 'guardrail',
                  min_relative_lift: -150,
                },
              ],
            },
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('Goal 1: guardrail threshold must be between -100 and 100.');
      });

      it('validates decision rule bounds', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.goal, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            name: 'Test',
            goal: {
              metric: 'revenue',
              conversion_window_days: 400,
              significance_level: 1,
              statistical_power: 0.2,
            },
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('Conversion window must be between 1 and 365 days.');
        expect(errors).toContain('Confidence level must be between 50% and 99.9%.');
        expect(errors).toContain('Statistical power must be between 50% and 99.9%.');
      });
    });

    describe('targeting step', () => {
      it('returns error when target type needs target_id but none set', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.targeting, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { target_type: 'product', segments: { page_rules: [] } },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('Target ID is required for the selected target type.');
      });

      it('returns error when holdout_percent out of 0-50', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.targeting, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { target_type: 'all', holdout_percent: 60 },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('Holdout percent must be between 0 and 50.');
      });

      it('returns no errors for target_type all (no target_id needed)', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.targeting, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { target_type: 'all', holdout_percent: 10 },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toHaveLength(0);
      });

      it('returns error when traffic ramp percent is out of range', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.targeting, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            target_type: 'all',
            segments: { traffic_ramp_percent: 120, traffic_ramp_days: 7 },
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('Traffic ramp percent must be between 0 and 100.');
      });

      it('returns error when traffic ramp days is invalid while ramp is enabled', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.targeting, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            target_type: 'all',
            segments: { traffic_ramp_percent: 25, traffic_ramp_days: 0 },
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain(
          'Traffic ramp days must be between 1 and 30 when ramp % is enabled.'
        );
      });

      it('partitionTargetingStepErrors maps known targeting errors to sections', () => {
        const parts = partitionTargetingStepErrors([
          'Target ID is required for the selected target type.',
          'Holdout percent must be between 0 and 50.',
          'Traffic ramp percent must be between 0 and 100.',
          'Targeting has selected products that are also excluded. Remove overlaps before starting.',
          'Some unexpected validation string',
        ]);
        expect(parts.page).toHaveLength(2);
        expect(parts.holdout).toHaveLength(1);
        expect(parts.advanced).toHaveLength(1);
        expect(parts.unmapped).toEqual(['Some unexpected validation string']);
      });

      it('getTargetingCoachHints surfaces holdout guidance when holdout is zero', () => {
        const hints = getTargetingCoachHints({
          formData: { holdout_percent: 0, segments: {} },
          isStandalone: false,
          isCheckoutTestType: false,
          maxHints: 5,
        });
        expect(hints.some(h => h.section === 'holdout')).toBe(true);
      });

      it('getTargetingCoachHints surfaces checkout holdout guidance', () => {
        const hints = getTargetingCoachHints({
          formData: { holdout_percent: 0, segments: {} },
          isStandalone: false,
          isCheckoutTestType: true,
          maxHints: 5,
        });
        expect(
          hints.some(h => h.section === 'holdout' && h.message.includes('Checkout holdout'))
        ).toBe(true);
      });

      it('getTargetingCoachHints surfaces commerce product scope guidance', () => {
        const hints = getTargetingCoachHints({
          formData: { holdout_percent: 10, segments: {} },
          isStandalone: false,
          isCheckoutTestType: false,
          targetingScopeFixedForCommerce: true,
          selectedScopeProductCount: 0,
          maxHints: 5,
        });
        expect(
          hints.some(h => h.section === 'page' && h.message.includes('selected products'))
        ).toBe(true);
      });
    });

    describe('traffic step', () => {
      it('returns error when allocation does not sum to 100%', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.traffic, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { variants: [{ allocation: 60 }, { allocation: 30 }] },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.includes('100%'))).toBe(true);
      });

      it('returns no errors when allocation sums to 100%', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.traffic, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: { variants: [{ allocation: 50 }, { allocation: 50 }] },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toHaveLength(0);
      });

      it('returns error for price test when per-variant override has invalid fixed price', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.traffic, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            variants: [
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: '' } },
              {
                name: 'Variant A',
                allocation: 50,
                config: {
                  priceMode: 'fixed',
                  price: '29',
                  byProduct: {
                    12345: {
                      byVariant: {
                        67890: { priceMode: 'fixed', price: -1 },
                      },
                    },
                  },
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(
          errors.some(e => e.includes('per-variant override') && e.includes('0 or greater'))
        ).toBe(true);
      });

      it('returns error for price test when fixed price is negative (on traffic step)', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.traffic, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            variants: [
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: null } },
              { name: 'Variant A', allocation: 50, config: { priceMode: 'fixed', price: -5 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors.some(e => e.includes('fixed price must be 0 or greater'))).toBe(true);
      });
    });

    describe('code step', () => {
      it('does not add method-specific errors for legacy priceApplicationMethod values', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            variants: [
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: null } },
              {
                name: 'Variant A',
                allocation: 50,
                config: {
                  priceMode: 'amount',
                  priceDelta: 5,
                  priceApplicationMethod: 'discounted_checkout_price',
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
          cssValidationErrors: [],
          jsValidationErrors: [],
        });
        expect(errors.some(e => e.includes('Native Variant Price'))).toBe(false);
        expect(errors.some(e => e.includes('Discounted Checkout Price'))).toBe(false);
      });

      it('returns error when price surface mappings contain duplicate selectors', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            target_type: 'all',
            variants: [
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: 10 } },
              { name: 'Variant A', allocation: 50, config: { priceMode: 'fixed', price: 12 } },
            ],
            segments: {
              price_surface_mappings: [
                { surface: 'pdp', role: 'regular', selector: '.product__price' },
                { surface: 'pdp', role: 'regular', selector: '.product__price' },
              ],
            },
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
          cssValidationErrors: [],
          jsValidationErrors: [],
        });
        expect(errors.some(error => error.includes('duplicates'))).toBe(true);
      });

      it('returns error when cssValidationErrors is non-empty', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {},
          initialData: {},
          showTemplateStep: true,
          cssValidationErrors: ['Invalid syntax'],
          jsValidationErrors: [],
        });
        expect(errors).toContain('Fix CSS syntax errors before continuing.');
      });

      it('returns error when jsValidationErrors is non-empty', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {},
          initialData: {},
          showTemplateStep: true,
          cssValidationErrors: [],
          jsValidationErrors: ['Unexpected token'],
        });
        expect(errors).toContain('Fix JavaScript syntax errors before continuing.');
      });

      it('returns error for price test when fixed price is negative', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            variants: [
              { name: 'Control', config: { priceMode: 'fixed', price: null } },
              { name: 'Variant A', config: { priceMode: 'fixed', price: -1 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors.some(e => e.includes('fixed price must be 0 or greater'))).toBe(true);
      });

      it('returns error for price test when percent is out of -100 to 100', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            variants: [
              { name: 'Control', config: { priceMode: 'percent' } },
              { name: 'Variant A', config: { priceMode: 'percent', pricePercent: 150 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors.some(e => e.includes('percent must be between -100 and 100'))).toBe(true);
      });

      it('allows price test percent -100 to 100 (negative = increase)', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            variants: [
              { name: 'Control', config: { priceMode: 'fixed', price: null } },
              { name: 'Variant A', config: { priceMode: 'percent', pricePercent: -10 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors.filter(e => e.includes('percent'))).toHaveLength(0);
      });

      it('treats first variant as non-control when it has a configured price', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            variants: [
              { name: 'Variant A', config: { priceMode: 'percent', pricePercent: 10 } },
              { name: 'Control', config: { priceMode: 'fixed', price: '' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors.filter(e => e.includes('At least one test variant'))).toHaveLength(0);
      });

      it('returns error for price test when amount (priceDelta) is not a valid number', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            variants: [
              { name: 'Control', config: { priceMode: 'fixed', price: null } },
              { name: 'Variant A', config: { priceMode: 'amount', priceDelta: 'abc' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors.some(e => e.includes('amount') && e.includes('valid number'))).toBe(true);
      });

      it('blocks price test progression when direct price override is not installed on the shop', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            name: 'Price Test',
            type: 'price',
            goal: { metric: 'revenue' },
            target_type: 'all-products',
            variants: [
              { name: 'Control', config: { priceMode: 'fixed', price: '' } },
              { name: 'Variant A', config: { priceMode: 'percent', pricePercent: 10 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
          priceExecution: {
            isShopify: true,
            isStandalone: false,
            directPriceOverrideReadiness: 'needs_install',
          },
        });
        expect(errors).toContain(
          'Price tests currently require Direct Price Override, but the RipX cart transform is not installed on this shop yet. Install/bind it before continuing.'
        );
      });

      it('returns error for price test when per-product override has invalid fixed price', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            target_type: 'product',
            target_id: 'gid://shopify/Product/100',
            variants: [
              { name: 'Control', config: { priceMode: 'fixed', price: null } },
              {
                name: 'Variant A',
                config: {
                  priceMode: 'fixed',
                  price: 30,
                  byProduct: {
                    'gid://shopify/Product/100': { priceMode: 'fixed', price: -2 },
                  },
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(
          errors.some(e => e.includes('per-product override') && e.includes('0 or greater'))
        ).toBe(true);
      });

      it('accepts matrix-only price config as a non-control price', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            target_type: 'all-products',
            variants: [
              { name: 'Control', config: { priceMode: 'fixed', price: '' } },
              {
                name: 'Variant A',
                config: {
                  priceMode: 'fixed',
                  price: '',
                  byProduct: {
                    'gid://shopify/Product/100': {
                      byVariant: {
                        'gid://shopify/ProductVariant/200': {
                          priceMode: 'fixed',
                          price: 42,
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors).not.toContain(
          'At least one test variant (non-control) must have a price configured. Go to Traffic step → Variant configuration.'
        );
        expect(errors).not.toContain(
          'At least one test variant (non-control) must have a price configured. Go to Traffic step → Variant configuration to set prices.'
        );
      });

      it('returns error for split-URL variant with invalid URL', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'content',
            variants: [
              { name: 'Control', config: { url: '' } },
              { name: 'Variant A', config: { url: 'http://[invalid' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'split-url',
        });
        expect(errors.some(e => e.includes('valid URL'))).toBe(true);
      });

      it('treats polluted split-url template keys as price when form type is price', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            goal: { template_key: 'split-url' },
            target_type: 'all-products',
            variants: [
              { name: 'Control', config: { priceMode: 'fixed', price: '' } },
              {
                name: 'Variant A',
                config: {
                  url: 'http://[invalid',
                  priceMode: 'percent',
                  pricePercent: 10,
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: null,
        });
        expect(errors.some(e => e.includes('valid URL'))).toBe(false);
        expect(errors).not.toContain(
          'At least one test variant (non-control) must have a price configured. Go to Traffic step → Variant configuration to set prices.'
        );
      });

      it('returns no error for split-URL variant with valid URL', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'content',
            variants: [
              { name: 'Control', config: { url: '' } },
              { name: 'Variant A', config: { url: 'https://example.com/pages/landing' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'split-url',
        });
        expect(errors.filter(e => e.includes('URL'))).toHaveLength(0);
      });

      it('returns error for offer variant with invalid discount value', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'offer',
            variants: [
              { name: 'Control', config: { discount_type: 'percent', discount_value: null } },
              { name: 'Variant A', config: { discount_type: 'percent', discount_value: 150 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'offer',
        });
        expect(errors.some(e => e.includes('percent discount') && e.includes('0 and 100'))).toBe(
          true
        );
      });

      it('returns error for offer test when selected-products scope has no selected products', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'offer',
            target_type: 'product',
            variants: [
              { name: 'Control', config: { discount_type: 'percent', discount_value: null } },
              { name: 'Variant A', config: { discount_type: 'percent', discount_value: 10 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'offer',
        });
        expect(
          errors.some(
            e =>
              e.includes('Offer test is set to "Selected products only"') &&
              e.includes('no products are selected')
          )
        ).toBe(true);
      });

      it('returns error for offer test when no non-control variant is actionable', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'offer',
            variants: [
              { name: 'Control', config: { discount_type: 'percent', discount_value: null } },
              { name: 'Variant A', config: { discount_type: 'percent', discount_value: '' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'offer',
        });
        expect(errors.some(e => e.includes('At least one offer variant'))).toBe(true);
      });

      it('returns error for offer variant with invalid discount code name', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'offer',
            variants: [
              { name: 'Control', config: {} },
              {
                name: 'Variant A',
                config: {
                  discount_type: 'percent',
                  discount_value: 10,
                  discount_code_name: 'BAD CODE!*',
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'offer',
        });
        expect(errors.some(e => e.includes('discount code name'))).toBe(true);
      });

      it('returns error for shipping test when no non-control variant is actionable', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              { name: 'Variant A', config: { strategy: 'control' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('At least one shipping variant'))).toBe(true);
      });

      it('returns no error for shipping test with actionable non-control variant', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              { name: 'Variant A', config: { strategy: 'flat_rate', amount: 5 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('At least one shipping variant'))).toBe(false);
      });

      it('accepts flat-rate variant when actionable configured rates are present', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'flat_rate',
                  amount: null,
                  rates: [
                    { name: 'Economy', amount: 5, priority: 1, sort_order: 1 },
                    { name: 'Express', amount: 9, priority: 2, sort_order: 2 },
                  ],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('At least one shipping variant'))).toBe(false);
        expect(errors.some(e => e.includes('flat rate requires'))).toBe(false);
      });

      it('rejects negative configured shipping rate amounts', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'flat_rate',
                  amount: null,
                  rates: [{ name: 'Economy', amount: -1, priority: 1, sort_order: 1 }],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('configured rate amounts'))).toBe(true);
      });

      it('requires a configured rate amount when delivery promise is set', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'flat_rate',
                  amount: 5,
                  rates: [
                    {
                      name: 'Promised row',
                      delivery_promise: { mode: 'preset', preset: 'next_business_day' },
                    },
                  ],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('delivery promise requires a rate amount'))).toBe(true);
      });

      it('accepts delivery method targets as actionable shipping configuration', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'carrier_quote',
                  execution_hint: 'delivery_customization',
                  delivery_method_names: ['Standard Shipping'],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('At least one shipping variant'))).toBe(false);
        expect(errors.some(e => e.includes('carrier quote requires'))).toBe(false);
      });

      it('requires delivery method targets for replacement flat rates', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'flat_rate',
                  amount: 44,
                  replace_existing_rates: true,
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('replacement flat rate requires'))).toBe(true);
      });

      it('accepts replacement flat rates with delivery method targets', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'flat_rate',
                  amount: 44,
                  replace_existing_rates: true,
                  delivery_method_names: ['Standard Delivery', 'Express'],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('replacement flat rate requires'))).toBe(false);
        expect(errors.some(e => e.includes('At least one shipping variant'))).toBe(false);
      });

      it('treats replace display mode as replacement validation path', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'flat_rate',
                  amount: 44,
                  shipping_display_mode: 'replace_existing_methods',
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('replacement flat rate requires'))).toBe(true);
      });

      it('rejects replacement flat rates that do not hide existing methods', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'flat_rate',
                  amount: 44,
                  replace_existing_rates: true,
                  delivery_method_names: ['Standard Delivery'],
                  delivery_action: 'rename',
                  delivery_rename_to: 'Tracked Standard',
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('can only hide'))).toBe(true);
      });

      it('requires rename target for delivery rename actions', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              {
                name: 'Variant A',
                config: {
                  strategy: 'carrier_quote',
                  execution_hint: 'delivery_customization',
                  delivery_method_names: ['Standard Delivery'],
                  delivery_action: 'rename',
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('delivery rename action requires'))).toBe(true);
      });

      it('rejects shipping percent discounts above 100', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            variants: [
              { name: 'Control', config: { strategy: 'control' } },
              { name: 'Variant A', config: { strategy: 'discount_percentage', percent_off: 150 } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('between 0 and 100'))).toBe(true);
      });

      it('returns error on targeting step when selected and excluded products overlap', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.targeting, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'price',
            target_type: 'product',
            target_ids: ['gid://shopify/Product/100', 'gid://shopify/Product/200'],
            segments: {
              page_rules: [],
              excluded_product_ids: ['gid://shopify/Product/200'],
            },
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'price',
        });
        expect(errors.some(e => e.includes('also in the excluded products list'))).toBe(true);
      });

      it('returns error for shipping targeting when selected-products scope has no products', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.targeting, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            target_type: 'product',
            segments: { page_rules: [] },
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(
          errors.some(e => e.includes('carts with selected products but no products are selected'))
        ).toBe(true);
      });

      it('returns error for shipping targeting when selected and excluded products overlap', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.targeting, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'shipping',
            target_type: 'product',
            target_ids: ['gid://shopify/Product/100', 'gid://shopify/Product/200'],
            segments: {
              page_rules: [],
              excluded_product_ids: ['gid://shopify/Product/200'],
            },
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'shipping',
        });
        expect(errors.some(e => e.includes('also in the excluded products list'))).toBe(true);
      });

      it('returns error for theme template-switch variant when template handle is missing', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'theme',
            variants: [
              { name: 'Control', config: { themeMode: 'template_switch', template: '' } },
              { name: 'Variant A', config: { themeMode: 'template_switch', template: '' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'template',
        });
        expect(errors.some(e => e.includes('template handle is required'))).toBe(true);
      });

      it('returns no error for theme asset-flag variant with body class', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'theme',
            variants: [
              { name: 'Control', config: { themeMode: 'asset_flag', bodyClass: '' } },
              {
                name: 'Variant A',
                config: { themeMode: 'asset_flag', bodyClass: 'ripx-theme-v2' },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'theme',
        });
        expect(errors.some(e => e.includes('Add theme configuration'))).toBe(false);
      });

      it('returns error for theme-redirect variant when redirect URL is missing', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'theme',
            variants: [
              { name: 'Control', config: { themeMode: 'theme_redirect', url: '' } },
              { name: 'Variant A', config: { themeMode: 'theme_redirect', url: '' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'theme',
        });
        expect(errors.some(e => e.includes('redirect URL is required'))).toBe(true);
      });

      it('returns no error for theme-redirect variant with a valid redirect URL', () => {
        const errors = getWizardStepErrors(stepIdsWithTemplate.code, {
          stepIds: stepIdsWithTemplate,
          reviewStepId: 6,
          formData: {
            type: 'theme',
            variants: [
              { name: 'Control', config: { themeMode: 'theme_redirect', url: '' } },
              {
                name: 'Variant A',
                config: { themeMode: 'theme_redirect', url: '/pages/theme-redesign-v2' },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'theme',
        });
        expect(errors.some(e => e.includes('redirect URL'))).toBe(false);
      });
    });

    describe('review step', () => {
      const reviewStepId = 6;

      it('returns errors for missing name and metric', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: { variants: [{ allocation: 50 }, { allocation: 50 }] },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toContain('Test name is required.');
        expect(errors).toContain('Select a success metric in the Goal & Metrics step.');
      });

      it('returns error when traffic allocation not 100%', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Test',
            goal: { metric: 'revenue' },
            variants: [{ allocation: 70 }, { allocation: 20 }],
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors.some(e => e.includes('Traffic allocation must equal 100%'))).toBe(true);
      });

      it('returns no errors when review step is valid', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Test',
            goal: { metric: 'revenue' },
            target_type: 'all',
            variants: [{ allocation: 50 }, { allocation: 50 }],
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors).toHaveLength(0);
      });

      it('returns error when price test has no non-control variant with price configured', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Price Test',
            type: 'price',
            goal: { metric: 'revenue' },
            target_type: 'all-products',
            variants: [
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: '' } },
              { name: 'Variant A', allocation: 50, config: { priceMode: 'fixed', price: '' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors.some(e => e.includes('At least one test variant'))).toBe(true);
      });

      it('returns no errors when price test has non-control variant with price', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Price Test',
            type: 'price',
            goal: { metric: 'revenue' },
            target_type: 'all-products',
            variants: [
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: '' } },
              {
                name: 'Variant A',
                allocation: 50,
                config: { priceMode: 'percent', pricePercent: 10 },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors.filter(e => e.includes('At least one test variant'))).toHaveLength(0);
      });

      it('blocks price test launch on review when direct price override is not deployed', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Price Test',
            type: 'price',
            goal: { metric: 'revenue' },
            target_type: 'all-products',
            variants: [
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: '' } },
              {
                name: 'Variant A',
                allocation: 50,
                config: { priceMode: 'percent', pricePercent: 10 },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          priceExecution: {
            isShopify: true,
            isStandalone: false,
            directPriceOverrideReadiness: 'needs_deploy',
          },
        });
        expect(errors).toContain(
          'Price test launch is blocked because the RipX cart transform is not deployed for this shop yet.'
        );
      });

      it('allows review when first variant has test pricing and later variant is control', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Price Test',
            type: 'price',
            goal: { metric: 'revenue' },
            target_type: 'all-products',
            variants: [
              {
                name: 'Variant A',
                allocation: 50,
                config: { priceMode: 'percent', pricePercent: 10 },
              },
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: '' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors.filter(e => e.includes('At least one test variant'))).toHaveLength(0);
      });

      it('returns error when review has per-product override with invalid fixed price', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Price Test',
            type: 'price',
            goal: { metric: 'revenue' },
            target_type: 'product',
            target_id: 'gid://shopify/Product/100',
            variants: [
              { name: 'Control', allocation: 50, config: { priceMode: 'fixed', price: '' } },
              {
                name: 'Variant A',
                allocation: 50,
                config: {
                  priceMode: 'fixed',
                  price: 29,
                  byProduct: {
                    'gid://shopify/Product/100': { priceMode: 'fixed', price: -1 },
                  },
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(
          errors.some(e => e.includes('per-product override') && e.includes('0 or greater'))
        ).toBe(true);
      });

      it('returns shipping actionable error on review when all variants are control', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Shipping Test',
            type: 'shipping',
            goal: { metric: 'revenue' },
            variants: [
              { name: 'Control', allocation: 50, config: { strategy: 'control' } },
              { name: 'Variant A', allocation: 50, config: { strategy: 'control' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
        });
        expect(errors.some(e => e.includes('At least one shipping variant'))).toBe(true);
      });

      it('uses selected template for offer review validation when type is legacy content', () => {
        const errors = getWizardStepErrors(reviewStepId, {
          stepIds: stepIdsWithTemplate,
          reviewStepId,
          formData: {
            name: 'Offer Test',
            type: 'content',
            goal: { metric: 'revenue' },
            variants: [
              { name: 'Control', allocation: 50, config: { discount_type: 'percent' } },
              { name: 'Variant A', allocation: 50, config: { discount_type: 'percent' } },
            ],
          },
          initialData: {},
          showTemplateStep: true,
          selectedTemplate: 'offer',
        });
        expect(errors.some(e => e.includes('At least one offer variant'))).toBe(true);
      });
    });

    describe('without template step (5-step flow)', () => {
      it('requires payment methods for checkout payment-method variants', () => {
        const errors = getWizardStepErrors(stepIdsNoTemplate.code, {
          stepIds: stepIdsNoTemplate,
          reviewStepId: 5,
          formData: {
            type: 'checkout',
            goal: { checkout_phase: 'payment_method' },
            variants: [
              { name: 'Control', allocation: 50, config: {} },
              { name: 'Variant A', allocation: 50, config: { payment_action: 'hide' } },
            ],
          },
          initialData: {},
          showTemplateStep: false,
          selectedTemplate: 'checkout',
        });
        expect(errors.some(e => e.includes('payment method'))).toBe(true);
      });

      it('accepts structured checkout experience sections on the code step', () => {
        const errors = getWizardStepErrors(stepIdsNoTemplate.code, {
          stepIds: stepIdsNoTemplate,
          reviewStepId: 5,
          formData: {
            type: 'checkout',
            goal: { checkout_phase: 'experience' },
            variants: [
              { name: 'Control', allocation: 50, config: {} },
              {
                name: 'Variant A',
                allocation: 50,
                config: {
                  checkout_sections: [
                    {
                      type: 'hero_notice',
                      enabled: true,
                      props: {
                        title: 'Checkout with confidence',
                        message: 'Secure payment and free returns.',
                        cta_kind: 'track',
                        cta_label: 'Continue securely',
                      },
                    },
                  ],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: false,
          selectedTemplate: 'checkout',
        });

        expect(errors).toHaveLength(0);
      });

      it('rejects structured checkout experience sections without actionable content', () => {
        const errors = getWizardStepErrors(stepIdsNoTemplate.code, {
          stepIds: stepIdsNoTemplate,
          reviewStepId: 5,
          formData: {
            type: 'checkout',
            goal: { checkout_phase: 'experience' },
            variants: [
              { name: 'Control', allocation: 50, config: {} },
              {
                name: 'Variant A',
                allocation: 50,
                config: {
                  checkout_sections: [
                    {
                      type: 'trust_box',
                      enabled: true,
                      props: {
                        title: '',
                        message: '',
                        cta_kind: 'none',
                      },
                    },
                  ],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: false,
          selectedTemplate: 'checkout',
        });

        expect(errors.some(e => e.includes('enabled checkout section'))).toBe(true);
      });

      it('rejects manual add-to-cart product lists without a merchandise or variant GID', () => {
        const errors = getWizardStepErrors(stepIdsNoTemplate.code, {
          stepIds: stepIdsNoTemplate,
          reviewStepId: 5,
          formData: {
            type: 'checkout',
            goal: { checkout_phase: 'experience' },
            variants: [
              { name: 'Control', allocation: 50, config: {} },
              {
                name: 'Variant A',
                allocation: 50,
                config: {
                  checkout_sections: [
                    {
                      type: 'product_list',
                      enabled: true,
                      props: {
                        title: 'Recommended add-ons',
                        product_action: 'add_to_cart',
                        product_source_mode: 'manual',
                        product_items: [{ title: 'Gift wrap' }],
                      },
                    },
                  ],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: false,
          selectedTemplate: 'checkout',
        });

        expect(errors.some(e => e.includes('merchandise or variant GID'))).toBe(true);
      });

      it('runs checkout validation on the review step', () => {
        const errors = getWizardStepErrors(5, {
          stepIds: stepIdsNoTemplate,
          reviewStepId: 5,
          formData: {
            name: 'Checkout Review Test',
            type: 'checkout',
            goal: {
              metric: 'conversion_rate',
              checkout_phase: 'delivery_method',
            },
            variants: [
              { name: 'Control', allocation: 50, config: {} },
              { name: 'Variant A', allocation: 50, config: { delivery_action: 'hide' } },
            ],
          },
          initialData: {},
          showTemplateStep: false,
          selectedTemplate: 'checkout',
        });

        expect(errors.some(e => e.includes('delivery method'))).toBe(true);
      });

      it('rejects invalid checkout studio enum and collection GID values before coercion', () => {
        const errors = getWizardStepErrors(stepIdsNoTemplate.code, {
          stepIds: stepIdsNoTemplate,
          reviewStepId: 5,
          formData: {
            type: 'checkout',
            goal: { checkout_phase: 'experience' },
            variants: [
              { name: 'Control', allocation: 50, config: {} },
              {
                name: 'Variant A',
                allocation: 50,
                config: {
                  checkout_sections: [
                    {
                      type: 'product_list',
                      enabled: true,
                      props: {
                        title: 'Recommended add-ons',
                        tone: 'loud',
                        layout: 'floating',
                        cta_kind: 'launch',
                        product_source_mode: 'collection',
                        product_source_collections: [{ id: 'not-a-gid' }],
                      },
                    },
                  ],
                },
              },
            ],
          },
          initialData: {},
          showTemplateStep: false,
          selectedTemplate: 'checkout',
        });

        expect(errors.some(e => e.includes('tone must be success'))).toBe(true);
        expect(errors.some(e => e.includes('layout must be banner'))).toBe(true);
        expect(errors.some(e => e.includes('CTA behavior must be'))).toBe(true);
        expect(errors.some(e => e.includes('must be a Shopify Collection GID'))).toBe(true);
      });

      it('goal step uses stepIds.goal (3)', () => {
        const errors = getWizardStepErrors(stepIdsNoTemplate.goal, {
          stepIds: stepIdsNoTemplate,
          reviewStepId: 5,
          formData: {},
          initialData: {},
          showTemplateStep: false,
        });
        expect(errors).toContain('Test name is required.');
      });

      it('review step id is 5', () => {
        const errors = getWizardStepErrors(5, {
          stepIds: stepIdsNoTemplate,
          reviewStepId: 5,
          formData: { name: 'X' },
          initialData: {},
          showTemplateStep: false,
        });
        expect(errors).toContain('Select a success metric in the Goal & Metrics step.');
      });
    });
  });
});
