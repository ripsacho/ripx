import {
  getStepIds,
  buildWizardSteps,
  TEST_TEMPLATES,
  TEST_TYPE_CATEGORIES,
} from '../testWizardConfig';

describe('testWizardConfig', () => {
  describe('getStepIds', () => {
    it('returns 6 steps when template step is shown', () => {
      const ids = getStepIds(true);
      expect(ids).toEqual({
        template: 1,
        traffic: 2,
        targeting: 3,
        goal: 4,
        code: 5,
        review: 6,
      });
    });

    it('returns 5 steps when template step is hidden', () => {
      const ids = getStepIds(false);
      expect(ids).toEqual({
        traffic: 1,
        targeting: 2,
        goal: 3,
        code: 4,
        review: 5,
      });
    });
  });

  describe('buildWizardSteps', () => {
    it('builds 6 steps for create mode with template step', () => {
      const steps = buildWizardSteps(true, 'create');
      expect(steps).toHaveLength(6);
      expect(steps[0].title).toBe('Select Test Type');
      expect(steps[5].title).toBe('Review & Create');
    });

    it('builds 6 steps for edit mode with template step', () => {
      const steps = buildWizardSteps(true, 'edit');
      expect(steps).toHaveLength(6);
      expect(steps[5].title).toBe('Review & Save');
    });

    it('builds 5 steps without template step', () => {
      const steps = buildWizardSteps(false, 'create');
      expect(steps).toHaveLength(5);
      expect(steps[0].title).toBe('Traffic Allocation');
      expect(steps[4].title).toBe('Review & Create');
    });

    it('each step has id, title, description', () => {
      const steps = buildWizardSteps(true, 'create');
      steps.forEach((step, i) => {
        expect(step).toHaveProperty('id', i + 1);
        expect(typeof step.title).toBe('string');
        expect(typeof step.description).toBe('string');
      });
    });
  });

  describe('TEST_TEMPLATES', () => {
    it('has expected template keys', () => {
      const keys = Object.keys(TEST_TEMPLATES);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toContain('price');
      expect(keys).toContain('content');
    });

    it('each template has name and defaultConfig with variants', () => {
      Object.values(TEST_TEMPLATES).forEach(t => {
        expect(t).toHaveProperty('name');
        expect(t).toHaveProperty('defaultConfig');
        expect(Array.isArray(t.defaultConfig.variants)).toBe(true);
      });
    });
  });

  describe('TEST_TYPE_CATEGORIES', () => {
    it('has content and profit categories', () => {
      expect(TEST_TYPE_CATEGORIES).toHaveProperty('content');
      expect(TEST_TYPE_CATEGORIES).toHaveProperty('profit');
    });

    it('content category has types array', () => {
      expect(Array.isArray(TEST_TYPE_CATEGORIES.content.types)).toBe(true);
      expect(TEST_TYPE_CATEGORIES.content.types.length).toBeGreaterThan(0);
    });
  });
});
