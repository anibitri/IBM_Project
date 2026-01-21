import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const HistoryContext = createContext(null);

export function HistoryProvider({ children }) {
  const [history, setHistory] = useState([]);

  // Add a new item (e.g., a new upload or chat session)
  const addHistoryItem = useCallback((item) => {
    if (!item || typeof item !== 'object') return;
    
    const newItem = {
      id: item.id ? String(item.id) : `doc-${Date.now()}`,
      name: item.name && item.name.trim() ? item.name : 'Untitled Chat',
      type: item.type || 'chat',
      createdAt: item.createdAt || Date.now(),
      lastActivityAt: Date.now(),
      messages: item.messages || [], // We now store messages inside the history item
      ...item
    };

    setHistory((prev) => {
      // Remove any existing item with the same ID to prevent duplicates
      const others = prev.filter((it) => it.id !== newItem.id);
      // Add new item to the top
      return [newItem, ...others];
    });
    
    return newItem.id;
  }, []);

  // Update an existing item (e.g., to add a message or change the name)
  const updateHistoryItem = useCallback((id, updates) => {
    setHistory((prev) => 
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, ...updates, lastActivityAt: Date.now() };
        }
        return item;
      })
    );
  }, []);

  // specific helper to append a message to a specific history item
  const addMessageToItem = useCallback((id, message) => {
    setHistory((prev) => 
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            lastActivityAt: Date.now(),
            messages: [...(item.messages || []), message]
          };
        }
        return item;
      })
    );
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  const value = useMemo(() => ({
    history,
    addHistoryItem,
    updateHistoryItem,
    addMessageToItem,
    clearHistory
  }), [history, addHistoryItem, updateHistoryItem, addMessageToItem, clearHistory]);

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within a HistoryProvider');
  return ctx;
}