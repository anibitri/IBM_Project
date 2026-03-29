import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Manages the collapsible, resizable AI-summary drawer in DiagramPanel.
 *
 * Separating this from DiagramPanel keeps the panel responsible only for
 * rendering; resize gesture logic lives here.
 *
 * @param {number} [defaultHeight=160] - Initial drawer height in pixels.
 */
export function useSummaryDrawer(defaultHeight = 160) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryHeight, setSummaryHeight] = useState(defaultHeight);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = summaryHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    },
    [summaryHeight]
  );

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      setSummaryHeight(Math.max(60, Math.min(500, startH.current + delta)));
    };
    const handleUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  return { summaryOpen, setSummaryOpen, summaryHeight, handleResizeStart };
}
