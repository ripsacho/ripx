import React from 'react';
import { Modal } from '@shopify/polaris';
import styles from '../TargetingSection.module.css';

export default function CheckoutStudioModal({ open, onClose, title, accentStyle, children }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="large">
      <Modal.Section>
        <div data-checkout-variant-editor-modal="" className={styles.checkoutVariantEditorModal}>
          <div className={styles.checkoutVariantShell} style={accentStyle}>
            {children}
          </div>
        </div>
      </Modal.Section>
    </Modal>
  );
}
