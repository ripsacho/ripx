import {
  canShowShippingExecution,
  shouldDisableShippingExecution,
} from '../reviewShippingExecution';

describe('reviewShippingExecution', () => {
  describe('canShowShippingExecution', () => {
    it('returns true only for edit-mode shipping tests with test id', () => {
      expect(
        canShowShippingExecution({
          mode: 'edit',
          testType: 'shipping',
          testId: 'test-1',
        })
      ).toBe(true);
    });

    it('returns false for create mode', () => {
      expect(
        canShowShippingExecution({
          mode: 'create',
          testType: 'shipping',
          testId: 'test-1',
        })
      ).toBe(false);
    });

    it('returns false for non-shipping test types', () => {
      expect(
        canShowShippingExecution({
          mode: 'edit',
          testType: 'price',
          testId: 'test-1',
        })
      ).toBe(false);
    });

    it('returns false when test id is missing', () => {
      expect(
        canShowShippingExecution({
          mode: 'edit',
          testType: 'shipping',
          testId: '',
        })
      ).toBe(false);
    });
  });

  describe('shouldDisableShippingExecution', () => {
    it('returns false when all flags are false', () => {
      expect(
        shouldDisableShippingExecution({
          shippingExecutionLoading: false,
          wizardLoading: false,
          submitLoading: false,
          isDirty: false,
        })
      ).toBe(false);
    });

    it('returns true when any blocking flag is true', () => {
      expect(
        shouldDisableShippingExecution({
          shippingExecutionLoading: true,
          wizardLoading: false,
          submitLoading: false,
          isDirty: false,
        })
      ).toBe(true);

      expect(
        shouldDisableShippingExecution({
          shippingExecutionLoading: false,
          wizardLoading: true,
          submitLoading: false,
          isDirty: false,
        })
      ).toBe(true);

      expect(
        shouldDisableShippingExecution({
          shippingExecutionLoading: false,
          wizardLoading: false,
          submitLoading: true,
          isDirty: false,
        })
      ).toBe(true);

      expect(
        shouldDisableShippingExecution({
          shippingExecutionLoading: false,
          wizardLoading: false,
          submitLoading: false,
          isDirty: true,
        })
      ).toBe(true);
    });
  });
});
