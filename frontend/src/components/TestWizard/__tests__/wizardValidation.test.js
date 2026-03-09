import { getWizardStepErrors } from '../wizardValidation';
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
        expect(errors).toContain('Select a success metric (Revenue, Conversion, or AOV).');
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
    });

    describe('code step', () => {
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
    });

    describe('without template step (5-step flow)', () => {
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
