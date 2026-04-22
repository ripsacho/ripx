import { useEffect, useMemo, useRef } from 'react';

export function useWizardSessionUiState({ mode, initialDataId }) {
  const wizardUiStateKey = useMemo(
    () => (mode === 'edit' && initialDataId ? `ripx-test-wizard-ui:${initialDataId}` : null),
    [mode, initialDataId]
  );
  const pendingWizardUiStateRef = useRef(null);
  const didRestoreWizardUiStateRef = useRef(false);

  useEffect(() => {
    pendingWizardUiStateRef.current = null;
    didRestoreWizardUiStateRef.current = false;
    if (!wizardUiStateKey || typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      const raw = window.sessionStorage.getItem(wizardUiStateKey);
      pendingWizardUiStateRef.current = raw ? JSON.parse(raw) : null;
    } catch {
      pendingWizardUiStateRef.current = null;
    }
  }, [wizardUiStateKey]);

  return {
    wizardUiStateKey,
    pendingWizardUiStateRef,
    didRestoreWizardUiStateRef,
  };
}
