import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Manages all zoom, pan, and view-mode state for the DiagramPanel.
 *
 * Extracting this logic from DiagramPanel satisfies SRP: the component
 * is responsible only for rendering; this hook is responsible only for
 * the interactive control state.
 *
 * @param {string|null} imageUrl - Resets zoom/pan whenever the image changes.
 * @returns Zoom/pan state, view mode, label visibility, and event handlers.
 */
export function useDiagramControls(imageUrl) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const didDrag = useRef(false);
  const [viewMode, setViewMode] = useState('2d');
  const [showLabels, setShowLabels] = useState(true);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    panRef.current = { x: 0, y: 0 };
  }, []);

  // Reset zoom and pan whenever the displayed image changes
  useEffect(() => {
    reset();
  }, [imageUrl, reset]);

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2))),
    []
  );
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2))),
    []
  );
  const zoomReset = useCallback(() => reset(), [reset]);

  const handleWheel = useCallback(
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)));
        else setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)));
      } else if (zoom > 1) {
        e.preventDefault();
        const newPan = {
          x: panRef.current.x - e.deltaX,
          y: panRef.current.y - e.deltaY,
        };
        panRef.current = newPan;
        setPan(newPan);
      }
    },
    [zoom]
  );

  const handlePanMouseDown = useCallback(
    (e) => {
      if (zoom <= 1) return;
      isDragging.current = true;
      didDrag.current = false;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
    },
    [zoom]
  );

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (!didDrag.current && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      didDrag.current = true;
      const newPan = {
        x: dragStart.current.panX + dx,
        y: dragStart.current.panY + dy,
      };
      panRef.current = newPan;
      setPan(newPan);
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  /** Returns true if the last mouse interaction was a click (not a drag). */
  const wasClick = useCallback(() => !didDrag.current, []);

  return {
    zoom,
    pan,
    viewMode,
    showLabels,
    setViewMode,
    setShowLabels,
    zoomIn,
    zoomOut,
    zoomReset,
    handleWheel,
    handlePanMouseDown,
    wasClick,
  };
}
