/**
 * Determines whether TestWizard should hydrate form state from incoming initialData.
 * In create mode, initialData is only a seed and must not overwrite user input later.
 */
export function shouldHydrateInitialData({
  hasInitialData,
  mode,
  createInitialDataAlreadyApplied,
}) {
  if (!hasInitialData) return false;
  if (mode !== 'create') return true;
  return !createInitialDataAlreadyApplied;
}
