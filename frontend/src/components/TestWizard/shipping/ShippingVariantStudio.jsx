import React, { Suspense, memo, useCallback } from 'react';
import ShippingVariantWorkspaceShell from './panels/ShippingVariantWorkspaceShell';
import useShippingVariantStudio from './hooks/useShippingVariantStudio';
import useRenderDebugCounter from './hooks/useRenderDebugCounter';

const ShippingVariantEditorPanel = React.lazy(() => import('./panels/ShippingVariantEditorPanel'));

function ShippingVariantStudio({ stepStyles, state, actions, renderers }) {
  useRenderDebugCounter('ShippingVariantStudio', () => ({
    activeVariantIndex: state?.activeShippingVariantIndex,
    activeStep: state?.editor?.activeShippingGuidedStep,
    variants: Array.isArray(state?.shippingVariants) ? state.shippingVariants.length : 0,
  }));
  const { workspaceShellProps, editorPanelProps } = useShippingVariantStudio({
    stepStyles,
    state,
    actions,
    renderers,
  });
  const renderEditorPanel = useCallback(
    () => (
      <Suspense fallback={null}>
        <ShippingVariantEditorPanel {...editorPanelProps} />
      </Suspense>
    ),
    [editorPanelProps]
  );

  return (
    <ShippingVariantWorkspaceShell {...workspaceShellProps} renderEditorPanel={renderEditorPanel} />
  );
}

export default memo(ShippingVariantStudio);
