import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HistoryContext = createContext(null);
const STORAGE_KEY = 'APP_HISTORY_V1';

export function HistoryProvider({ children }) {
  const [history, setHistory] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false); // To prevent saving empty state over existing data

  // 1. Load History on App Start
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setHistory(JSON.parse(stored));
        }
      } catch (e) {
        console.error('Failed to load history', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadHistory();
  }, []);

  // 2. Save History whenever it changes (only after initial load)
  useEffect(() => {
    if (isLoaded) {
      const saveHistory = async () => {
        try {
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (e) {
          console.error('Failed to save history', e);
        }
      };
      saveHistory();
    }
  }, [history, isLoaded]);

  // Add a new item
  const addHistoryItem = useCallback((item) => {
    if (!item || typeof item !== 'object') return;
    
    const newItem = {
      id: item.id ? String(item.id) : `doc-${Date.now()}`,
      name: item.name && item.name.trim() ? item.name : 'Untitled',
      type: item.type || 'chat', // 'chat' or 'schematic'
      createdAt: item.createdAt || Date.now(),
      lastActivityAt: Date.now(),
      messages: item.messages || [], 
      // Ensure we capture status and metadata for uploads
      status: item.status || 'completed', 
      ...item
    };

    setHistory((prev) => {
      // Remove duplicate IDs if they exist, put new one at top
      const others = prev.filter((it) => it.id !== newItem.id);
      return [newItem, ...others];
    });
    
    return newItem.id;
  }, []);

  // Update an item (Critical for "Analyzing..." -> "Completed")
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

  // Delete a specific item (New Feature)
  const deleteHistoryItem = useCallback((id) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, []);

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

  const clearHistory = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({
    history,
    addHistoryItem,
    updateHistoryItem,
    deleteHistoryItem, // Exported this
    addMessageToItem,
    clearHistory
  }), [history, addHistoryItem, updateHistoryItem, deleteHistoryItem, addMessageToItem, clearHistory]);

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within a HistoryProvider');
  return ctx;
}