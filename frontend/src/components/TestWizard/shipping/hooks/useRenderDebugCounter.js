import { useEffect, useRef } from 'react';

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'enabled']);

function isRenderDebugEnabled() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false;
  }
  try {
    const raw = String(window.localStorage?.getItem('ripx_shipping_render_debug') || '')
      .trim()
      .toLowerCase();
    return ENABLED_VALUES.has(raw);
  } catch {
    return false;
  }
}

export default function useRenderDebugCounter(componentName, metaFactory) {
  const renderCountRef = useRef(0);
  const mountedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());

  useEffect(() => {
    if (!isRenderDebugEnabled()) {
      return;
    }
    renderCountRef.current += 1;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedMs = Math.round(now - mountedAtRef.current);
    const meta = typeof metaFactory === 'function' ? metaFactory() : undefined;
    if (meta && typeof meta === 'object') {
      console.debug(
        `[shipping-render] ${componentName} #${renderCountRef.current} (+${elapsedMs}ms)`,
        meta
      );
      return;
    }
    console.debug(
      `[shipping-render] ${componentName} #${renderCountRef.current} (+${elapsedMs}ms)`
    );
  });
}
