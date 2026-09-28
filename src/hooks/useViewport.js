import { useEffect, useState } from 'react';

const QUERIES = {
  // < 768px: single-pane phone layout
  mobile: '(max-width: 767px)',
  // 768–1023px: condensed rails
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  // Primary input cannot hover (touch): show actions without hover
  touch: '(hover: none) and (pointer: coarse)',
};

function read() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return { isMobile: false, isTablet: false, isTouch: false };
  }
  return {
    isMobile: window.matchMedia(QUERIES.mobile).matches,
    isTablet: window.matchMedia(QUERIES.tablet).matches,
    isTouch: window.matchMedia(QUERIES.touch).matches,
  };
}

/**
 * Viewport class of the current window. Re-evaluates on resize/orientation
 * change via matchMedia listeners (no resize thrash).
 */
export function useViewport() {
  const [state, setState] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const lists = Object.values(QUERIES).map((q) => window.matchMedia(q));
    const update = () => setState(read());
    lists.forEach((l) => l.addEventListener('change', update));
    return () => lists.forEach((l) => l.removeEventListener('change', update));
  }, []);

  return state;
}
