import { useState, useCallback, useEffect } from 'react';

/**
 * Manages which workspace panels are currently open.
 *
 * Rules enforced:
 *  - At least one panel must remain open at all times.
 *  - The chat panel is auto-opened whenever a pending question arrives
 *    from component selection.
 *
 * @param {string[]} defaultPanels  - Panel IDs open on mount.
 * @param {*}        pendingQuestion - From DocumentContext; triggers chat auto-open.
 * @returns {{ activePanels: string[], togglePanel: (id: string) => void }}
 */
export function usePanelManager(defaultPanels, pendingQuestion) {
  const [activePanels, setActivePanels] = useState(defaultPanels);

  // Auto-open chat when an AI question is pending
  useEffect(() => {
    if (pendingQuestion && !activePanels.includes('chat')) {
      setActivePanels((prev) => [...prev, 'chat']);
    }
  }, [pendingQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePanel = useCallback((panelId) => {
    setActivePanels((prev) => {
      if (prev.includes(panelId)) {
        // Prevent closing the last open panel
        if (prev.length <= 1) return prev;
        return prev.filter((p) => p !== panelId);
      }
      return [...prev, panelId];
    });
  }, []);

  return { activePanels, togglePanel };
}
