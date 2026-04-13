export function canShowShippingExecution({ mode, testType, testId }) {
  const normalizedType = String(testType || '')
    .trim()
    .toLowerCase();
  return mode === 'edit' && normalizedType === 'shipping' && Boolean(testId);
}

export function shouldDisableShippingExecution({
  shippingExecutionLoading,
  wizardLoading,
  submitLoading,
  isDirty,
}) {
  return Boolean(shippingExecutionLoading || wizardLoading || submitLoading || isDirty);
}
