/**
 * useCursorGlow - Tracks cursor position for ambient glow effect
 */
import { useState, useEffect } from 'react';

export function useCursorGlow(enabled = true) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const handleMove = (e) => {
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };
    const handleLeave = () => setVisible(false);
    window.addEventListener('mousemove', handleMove);
    document.documentElement.addEventListener('mouseleave', handleLeave);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.documentElement.removeEventListener('mouseleave', handleLeave);
    };
  }, [enabled]);

  return { pos, visible };
}
