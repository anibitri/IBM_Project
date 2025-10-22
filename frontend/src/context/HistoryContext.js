import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const HistoryContext = createContext(null);

export function HistoryProvider({ children }) {
  const [history, setHistory] = useState([]);

  const addHistoryItem = useCallback((item) => {
    if (!item || typeof item !== 'object') return;
    const safe = (() => {
      const id = item.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const name = typeof item.name === 'string' && item.name.trim() ? item.name : 'Untitled';
      // removed createdAt defaulting
      return { ...item, id: String(id), name };
    })();

    setHistory((prev) => {
      const withoutDup = prev.filter((it) => it && it.id !== safe.id);
      return [safe, ...withoutDup];
    });
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  const value = useMemo(() => ({ history, addHistoryItem, clearHistory }), [history, addHistoryItem, clearHistory]);

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within a HistoryProvider');
  return ctx;
}