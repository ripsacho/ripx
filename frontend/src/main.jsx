/**
 * Main Entry Point
 *
 * React application entry point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import './index.css';

function showFallback(message) {
  const root = document.getElementById('root');
  if (!root) return;
  const url = typeof window !== 'undefined' ? window.location.href : '';
  root.innerHTML =
    '<div style="padding:24px;font-family:system-ui,sans-serif;max-width:400px;">' +
    '<p style="margin:0 0 16px;color:#333;">' +
    (message || 'Something went wrong.') +
    '</p>' +
    (url
      ? '<p><a href="' +
        url +
        '" target="_blank" rel="noopener noreferrer" style="color:#0891b2;">Open app in new tab</a></p>'
      : '') +
    '</div>';
}

if (typeof window !== 'undefined' && window.self !== window.top && window.parent) {
  try {
    const parent = window.parent;
    const ourOrigin = window.location.origin;
    const rawPostMessage = parent.postMessage.bind(parent);
    parent.postMessage = function (message, targetOrigin, transfer) {
      const resolvedOrigin =
        targetOrigin === ourOrigin ? 'https://admin.shopify.com' : targetOrigin;
      rawPostMessage(message, resolvedOrigin, transfer);
    };
  } catch {
    // ignore postMessage patch errors
  }
}

try {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary minimal>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } else {
    showFallback('Root element not found.');
  }
} catch (err) {
  console.error('App bootstrap error:', err);
  showFallback('Failed to load the app. Try opening in a new tab.');
}
