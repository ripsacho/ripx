import { useEffect, useState } from 'react';

export function useStickyProgressBar(progressBarRef) {
  const [progressBarStuck, setProgressBarStuck] = useState(false);

  useEffect(() => {
    const el = progressBarRef.current;
    if (!el) return;
    const STICKY_TOP = 48;
    const HYSTERESIS = 8;
    let ticking = false;
    let lastStuck = false;
    const checkStuck = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const rect = el.getBoundingClientRect();
          const top = rect.top;
          const stuck = lastStuck ? top <= STICKY_TOP + HYSTERESIS : top <= STICKY_TOP;
          lastStuck = stuck;
          setProgressBarStuck(stuck);
          ticking = false;
        });
        ticking = true;
      }
    };
    checkStuck();
    window.addEventListener('scroll', checkStuck, { passive: true });
    return () => window.removeEventListener('scroll', checkStuck);
  }, [progressBarRef]);

  return progressBarStuck;
}
