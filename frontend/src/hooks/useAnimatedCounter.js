/**
 * useAnimatedCounter - Animates a number from 0 to target value
 */
import { useState, useEffect, useRef } from 'react';

export function useAnimatedCounter(target, duration = 1200, enabled = true) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevTarget = useRef();
  const startTime = useRef(null);
  const rafRef = useRef();

  useEffect(() => {
    if (!enabled) {
      setDisplayValue(typeof target === 'number' ? target : 0);
      return;
    }

    const start = prevTarget.current;
    prevTarget.current = target;
    const startVal = typeof start === 'number' ? start : 0;
    const endVal = typeof target === 'number' ? target : 0;

    if (startVal === endVal) return;

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
  }, [target, duration, enabled]);

  return displayValue;
}
