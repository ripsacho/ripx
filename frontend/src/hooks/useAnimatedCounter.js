/**
 * useAnimatedCounter - Animates a number from 0 to target value
 */
import { useState, useEffect, useRef } from 'react';

function toNum(v) {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export function useAnimatedCounter(target, duration = 1200, enabled = true) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevTarget = useRef();
  const startTime = useRef(null);
  const rafRef = useRef();
  const endVal = toNum(target);

  useEffect(() => {
    if (!enabled) {
      setDisplayValue(endVal);
      return;
    }

    const start = prevTarget.current;
    prevTarget.current = endVal;
    const startVal = typeof start === 'number' && !Number.isNaN(start) ? start : 0;

    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    const animate = timestamp => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        startTime.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [endVal, duration, enabled]);

  return displayValue;
}
