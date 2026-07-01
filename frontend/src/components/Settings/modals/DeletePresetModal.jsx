import { Modal } from '@shopify/polaris';

export function DeletePresetModal({ open, loading, onClose, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose()}
      title="Delete preset?"
      primaryAction={{
        content: 'Delete',
        destructive: true,
        loading,
        onAction: onConfirm,
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: onClose,
          disabled: loading,
        },
      ]}
    />
  );
}
