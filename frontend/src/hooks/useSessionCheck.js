/**
 * useSessionCheck
 *
 * Periodically validates the current login session. If the session is invalid (401),
 * the API response interceptor clears auth storage and redirects to Connect (login).
 * Runs only when the user is on an authenticated route (not on Connect or public pages).
 * Pauses the interval when the tab is hidden and runs once when the tab becomes visible again.
 */

import { useEffect, useRef } from 'react';
import { apiGet } from '../services';
import { INTERVALS } from '../constants';

const VISIBILITY_DEBOUNCE_MS = INTERVALS.SESSION_CHECK_VISIBILITY_DEBOUNCE ?? 2000;

/**
 * @param {boolean} enabled - When true, session checks run (user has creds and is not on a public path)
 */
export function useSessionCheck(enabled) {
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastVisibilityCheckRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const intervalMs = INTERVALS.SESSION_CHECK ?? 5 * 60 * 1000;
    const initialDelayMs = INTERVALS.SESSION_CHECK_INITIAL_DELAY ?? 25 * 1000;

    const checkSession = () => {
      apiGet('/admin/me').catch(() => {
        // 401 → interceptor clears auth storage and redirects to /connect
        // Other errors (network, etc.) are ignored for this background check
      });
    };

    const startInterval = () => {
      if (intervalRef.current) return;
      intervalRef.current = window.setInterval(checkSession, intervalMs);
    };

    const stopInterval = () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    timeoutRef.current = window.setTimeout(() => {
      checkSession();
      if (document.visibilityState === 'visible') {
        startInterval();
      }
    }, initialDelayMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopInterval();
        return;
      }
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastVisibilityCheckRef.current < VISIBILITY_DEBOUNCE_MS) return;
        lastVisibilityCheckRef.current = now;
        checkSession();
        startInterval();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      stopInterval();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);
}
