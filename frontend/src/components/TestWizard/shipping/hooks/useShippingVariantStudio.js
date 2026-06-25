import { useMemo } from 'react';

export default function useShippingVariantStudio({ stepStyles, state, actions, renderers }) {
  const {
    shippingVariants,
    activeShippingVariantIndex,
    getShippingReadiness,
    getVariantColor,
    getVariantColorLight,
    getShippingVariantSummary,
    activeVariantName,
    strategyGuidance,
    activeReadiness,
    shippingReadinessList,
    editor,
    preview,
  } = state;
  const { onSelectVariant } = actions;
  const reviewPanelProps = useMemo(
    () => (editor.reviewPanelProps ? { ...editor.reviewPanelProps, stepStyles } : undefined),
    [editor.reviewPanelProps, stepStyles]
  );

  const workspaceShellProps = useMemo(
    () => ({
      stepStyles,
      shippingVariants,
      activeShippingVariantIndex,
      onSelectVariant,
      getShippingReadiness,
      getVariantColor,
      getVariantColorLight,
      getShippingVariantSummary,
      activeVariantName,
      strategyGuidance,
      activeReadiness,
      shippingReadinessList,
      previewProps: preview,
    }),
    [
      stepStyles,
      shippingVariants,
      activeShippingVariantIndex,
      onSelectVariant,
      getShippingReadiness,
      getVariantColor,
      getVariantColorLight,
      getShippingVariantSummary,
      activeVariantName,
      strategyGuidance,
      activeReadiness,
      shippingReadinessList,
      preview,
    ]
  );
  const editorPanelProps = useMemo(
    () => ({
      stepStyles,
      ...editor,
      reviewPanelProps,
      ...actions,
      ...renderers,
    }),
    [stepStyles, editor, reviewPanelProps, actions, renderers]
  );
  return { workspaceShellProps, editorPanelProps };
}
