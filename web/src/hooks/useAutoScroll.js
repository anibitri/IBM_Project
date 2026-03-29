import { useRef, useEffect } from 'react';

/**
 * Scrolls a sentinel element into view whenever the dependency list changes.
 *
 * Usage:
 *   const endRef = useAutoScroll([chatHistory, isLoading]);
 *   // In JSX: <div ref={endRef} />
 *
 * @param {Array} deps - Values that trigger a scroll when they change.
 * @returns {React.RefObject} Ref to attach to the scroll-target element.
 */
export function useAutoScroll(deps = []) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return endRef;
}
