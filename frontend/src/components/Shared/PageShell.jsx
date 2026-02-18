/**
 * PageShell Component
 *
 * Unified page wrapper for consistent layout, styling, and feedback across all pages.
 * Applies PageShell CSS (card accents, header underline) and optional Toast.
 *
 * @param {React.ReactNode} children - Page content
 * @param {string} [message] - Toast message (success/error)
 * @param {string} [messageType] - 'success' | 'error'
 * @param {Function} [onCloseMessage] - Callback when toast is dismissed
 * @param {number} [messageDuration] - Toast duration (ms)
 * @param {string} [className] - Additional CSS classes (e.g. wizard-page, settingsPage)
 */

import React from 'react';
import Toast from '../Toast/Toast';
import styles from './PageShell.module.css';

const DEFAULT_TOAST_DURATION = 3000;
const ERROR_TOAST_DURATION = 5000;

function PageShell({
  children,
  message,
  messageType = 'success',
  onCloseMessage,
  messageDuration,
  className = '',
}) {
  const duration =
    messageDuration ?? (messageType === 'error' ? ERROR_TOAST_DURATION : DEFAULT_TOAST_DURATION);
  const classNames = [styles.page, className].filter(Boolean).join(' ');

  return (
    <div className={classNames}>
      {message && (
        <Toast
          message={message}
          type={messageType}
          onClose={onCloseMessage || (() => {})}
          duration={duration}
        />
      )}
      {children}
    </div>
  );
}

export default React.memo(PageShell);
