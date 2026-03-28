import { shouldHydrateInitialData } from '../initialDataHydration';

describe('initialDataHydration', () => {
  it('does not hydrate when initialData is missing', () => {
    expect(
      shouldHydrateInitialData({
        hasInitialData: false,
        mode: 'create',
        createInitialDataAlreadyApplied: false,
      })
    ).toBe(false);
  });

  it('hydrates once in create mode before initial seed is applied', () => {
    expect(
      shouldHydrateInitialData({
        hasInitialData: true,
        mode: 'create',
        createInitialDataAlreadyApplied: false,
      })
    ).toBe(true);
  });

  it('does not re-hydrate in create mode after initial seed is applied', () => {
    expect(
      shouldHydrateInitialData({
        hasInitialData: true,
        mode: 'create',
        createInitialDataAlreadyApplied: true,
      })
    ).toBe(false);
  });

  it('always hydrates in edit mode when initialData exists', () => {
    expect(
      shouldHydrateInitialData({
        hasInitialData: true,
        mode: 'edit',
        createInitialDataAlreadyApplied: true,
      })
    ).toBe(true);
  });
});
