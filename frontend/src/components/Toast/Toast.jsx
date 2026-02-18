/**
 * Toast Notification Component
 *
 * Floating notification for success/error messages
 */

import React, { useEffect } from 'react';
import './Toast.css';

function Toast({ message, type = 'success', onClose = () => {}, duration = 3000 }) {
  useEffect(() => {
    if (!message || duration <= 0 || !onClose) return;
    const timer = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div
      className={`toast toast-${type}`}
      role="alert"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="toast-content">
        <span className="toast-icon">
          {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
        </span>
        <span className="toast-message">{message}</span>
        <button className="toast-close" onClick={onClose} aria-label="Close notification">
          ×
        </button>
      </div>
    </div>
  );
}

export default Toast;
