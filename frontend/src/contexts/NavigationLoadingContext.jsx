/**
 * Global route-transition loading indicator (sidebar / in-app navigation).
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RouteLoading } from '../components/LoadingSkeleton/RouteLoading';

const NavigationLoadingContext = createContext(null);

/** Keep overlay visible long enough for lazy chunks on slow networks / after deploy. */
const MIN_VISIBLE_MS = 400;
const POST_PATHNAME_SETTLE_MS = 1200;

export function NavigationLoadingProvider({ children }) {
  const location = useLocation();
  const [isNavigating, setIsNavigating] = useState(false);
  const navigatingSinceRef = useRef(0);
  const locationKeyRef = useRef(location.key);

  const beginNavigation = useCallback(() => {
    navigatingSinceRef.current = Date.now();
    setIsNavigating(true);
  }, []);

  useEffect(() => {
    if (locationKeyRef.current === location.key) return undefined;
    locationKeyRef.current = location.key;

    const elapsed = navigatingSinceRef.current ? Date.now() - navigatingSinceRef.current : 0;
    const delay = Math.max(POST_PATHNAME_SETTLE_MS, MIN_VISIBLE_MS - elapsed);
    const timer = window.setTimeout(() => {
      setIsNavigating(false);
      navigatingSinceRef.current = 0;
    }, delay);
    return () => window.clearTimeout(timer);
  }, [location.key, location.pathname]);

  useEffect(() => {
    if (!isNavigating) return undefined;
    const safety = window.setTimeout(() => {
      setIsNavigating(false);
      navigatingSinceRef.current = 0;
    }, 20000);
    return () => window.clearTimeout(safety);
  }, [isNavigating]);

  return (
    <NavigationLoadingContext.Provider value={{ beginNavigation, isNavigating }}>
      {children}
      {isNavigating ? (
        <>
          <RouteLoading message="Loading page…" variant="topBar" />
          <RouteLoading message="Loading page…" contentOverlay />
        </>
      ) : null}
    </NavigationLoadingContext.Provider>
  );
}

export function useNavigationLoading() {
  const ctx = useContext(NavigationLoadingContext);
  if (!ctx) {
    return {
      beginNavigation: () => {},
      isNavigating: false,
    };
  }
  return ctx;
}
