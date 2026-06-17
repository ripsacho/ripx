import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Spinner } from '@shopify/polaris';
import styles from './BlockingOverlay.module.css';

const OVERLAY_ROOT_ID = 'ripx-overlay-root';

function getOverlayRoot() {
  if (typeof document === 'undefined') {
    return null;
  }
  let root = document.getElementById(OVERLAY_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    document.body.appendChild(root);
  }
  root.setAttribute('data-ripx-overlay-root', 'true');
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.zIndex = '2147483647';
  root.style.pointerEvents = 'none';
  return root;
}

function BlockingOverlay({ open, title, message, accessibilityLabel, steps = [] }) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const root = getOverlayRoot();
  if (!root) {
    return null;
  }

  return createPortal(
    <div
      className={styles.overlay}
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-busy="true"
      aria-label={accessibilityLabel || title || 'Loading'}
    >
      <div className={styles.card}>
        <Spinner accessibilityLabel={accessibilityLabel || title || 'Loading'} size="large" />
        {title ? <strong className={styles.title}>{title}</strong> : null}
        {message ? <span className={styles.message}>{message}</span> : null}
        {Array.isArray(steps) && steps.length > 0 ? (
          <ol className={styles.stepsList}>
            {steps.map((step, index) => {
              const label = String(step?.label || '').trim();
              if (!label) return null;
              const state = String(step?.state || 'pending').toLowerCase();
              const indicator = state === 'complete' ? '✓' : state === 'error' ? '!' : index + 1;
              return (
                <li
                  key={label}
                  className={`${styles.stepItem} ${styles[`stepItem${state[0]?.toUpperCase()}${state.slice(1)}`] || ''}`}
                >
                  <span className={styles.stepIndicator} aria-hidden="true">
                    {indicator}
                  </span>
                  <span className={styles.stepLabel}>{label}</span>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>,
    root
  );
}

export default BlockingOverlay;
