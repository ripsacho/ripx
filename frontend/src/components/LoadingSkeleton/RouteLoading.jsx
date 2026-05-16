/**
 * RouteLoading – Smart loading UI for route transitions and redirects
 *
 * Shows a slim top progress bar + centered card with logo, spinner, and message.
 * Used as Suspense fallback and for post-login redirect overlay.
 */

import React from 'react';
import styles from './RouteLoading.module.css';

export function RouteLoading({
  message = 'Loading…',
  fullScreen = false,
  contentOverlay = false,
  variant,
}) {
  const resolvedVariant =
    variant || (fullScreen ? 'fullScreen' : contentOverlay ? 'contentOverlay' : 'inline');
  const className = [
    styles.wrapper,
    resolvedVariant === 'fullScreen' && styles.fullScreen,
    resolvedVariant === 'contentOverlay' && styles.contentOverlay,
    resolvedVariant === 'topBar' && styles.topBar,
  ]
    .filter(Boolean)
    .join(' ');

  if (resolvedVariant === 'topBar') {
    return (
      <div
        className={className}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={message}
      >
        <div className={styles.progressBar} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className={styles.progressBar} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.logoWrap}>
          <img src="/logo.svg" alt="" className={styles.logo} width={48} height={48} />
        </div>
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}

export default RouteLoading;
