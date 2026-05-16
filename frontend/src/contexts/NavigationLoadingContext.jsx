/**
 * Global route-transition loading indicator (sidebar / in-app navigation).
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RouteLoading } from '../components/LoadingSkeleton/RouteLoading';

const NavigationLoadingContext = createContext(null);

const MIN_VISIBLE_MS = 320;

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
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const timer = window.setTimeout(() => {
      setIsNavigating(false);
      navigatingSinceRef.current = 0;
    }, delay);
    return () => window.clearTimeout(timer);
  }, [location.key]);

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
      {isNavigating ? <RouteLoading message="Loading page…" variant="topBar" /> : null}
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
