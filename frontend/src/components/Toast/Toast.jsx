/**
 * Toast Notification Component
 *
 * Floating notification for success/error messages.
 * Optional stacked title + detail and progress bar for prominent events (e.g. store switch).
 */

import React, { useEffect, useMemo } from 'react';
import './Toast.css';

function StoreSwitchLeadingIcon() {
  return (
    <span className="toast-icon toast-icon-store-switch" aria-hidden>
      <svg
        className="toast-store-svg"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4 10.5V20a1 1 0 001 1h4.5v-6.25a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75V21H19a1 1 0 001-1v-9.5M2 9.25 10.5h20M3.75 9.25V6.5A1.5 1.5 0 015.25 5h13.5a1.5 1.5 0 011.5 1.5v2.75M9.5 5v3.25M14.5 5v3.25"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="toast-store-check">✓</span>
    </span>
  );
}

function formatToastText(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(formatToastText).filter(Boolean).join('. ');
  }
  if (typeof value === 'object') {
    const parts = [
      value.message,
      value.error,
      value.status,
      value.code,
      value.field
        ? `Field: ${Array.isArray(value.field) ? value.field.join('.') : value.field}`
        : '',
    ]
      .map(formatToastText)
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join('. ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return 'Unexpected notification detail.';
    }
  }
  return String(value);
}

function Toast({
  message,
  title,
  detail,
  type = 'success',
  onClose = () => {},
  duration = 3000,
  className = '',
  /** 'store-switch' shows storefront + check animation */
  icon = 'default',
  /** Thin countdown bar at bottom (e.g. store switch) */
  showProgress = false,
}) {
  const safeMessage = formatToastText(message);
  const safeTitle = formatToastText(title);
  const safeDetail = formatToastText(detail);
  const hasStack = Boolean(safeTitle || safeDetail);
  const bodyLine = safeDetail || safeMessage;
  const visible = Boolean(hasStack ? bodyLine || safeTitle : safeMessage);

  const ariaLabel = useMemo(() => {
    if (safeTitle && safeDetail) return `${safeTitle}. ${safeDetail}`;
    if (safeTitle && bodyLine) return `${safeTitle}. ${bodyLine}`;
    return safeMessage || '';
  }, [safeTitle, safeDetail, bodyLine, safeMessage]);

  useEffect(() => {
    if (!visible || duration <= 0 || !onClose) return;
    const timer = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onClose]);

  if (!visible) return null;

  const extra = className ? ` ${className}` : '';
  const withProgress = showProgress ? ' toast-with-progress' : '';
  const defaultIcon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  const isError = type === 'error';

  return (
    <div
      className={`toast toast-${type}${extra}${withProgress}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      aria-label={ariaLabel}
    >
      <div className="toast-content">
        {icon === 'store-switch' && type === 'success' ? (
          <StoreSwitchLeadingIcon />
        ) : (
          <span className="toast-icon">{defaultIcon}</span>
        )}
        {hasStack ? (
          <div className="toast-message-stack">
            {safeTitle ? <span className="toast-title">{safeTitle}</span> : null}
            {bodyLine ? <span className="toast-detail">{bodyLine}</span> : null}
          </div>
        ) : (
          <span className="toast-message">{safeMessage}</span>
        )}
        <button
          type="button"
          className="toast-close"
          onClick={onClose}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
      {showProgress ? (
        <div
          className="toast-progress"
          style={{ '--toast-duration-ms': `${duration}ms` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

export default Toast;
