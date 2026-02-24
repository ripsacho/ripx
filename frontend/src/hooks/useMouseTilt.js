/**
 * useMouseTilt - 3D tilt effect based on mouse position
 * Returns transform style for parallax card effect
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export function useMouseTilt(maxTilt = 8, enabled = true) {
  const [transform, setTransform] = useState('');
  const ref = useRef(null);

  const handleMouseMove = useCallback(
    e => {
      if (!enabled || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const rotateX = -y * maxTilt;
      const rotateY = x * maxTilt;
      setTransform(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`);
    },
    [enabled, maxTilt]
  );

  const handleMouseLeave = useCallback(() => {
    setTransform('');
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return { ref, style: { transform } };
}
