import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HistoryContext = createContext(null);
const STORAGE_KEY = 'APP_HISTORY_V1';

// ==========================================
// 1. STORAGE HOOK (Handles AsyncStorage)
// ==========================================
function useHistoryStorage(key) {
  const [history, setHistory] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load History on App Start
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(key);
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
  }, [key]);

  // Save History whenever it changes (only after initial load)
  useEffect(() => {
    if (isLoaded) {
      const saveHistory = async () => {
        try {
          await AsyncStorage.setItem(key, JSON.stringify(history));
        } catch (e) {
          console.error('Failed to save history', e);
        }
      };
      saveHistory();
    }
  }, [history, isLoaded, key]);

  return { history, setHistory, isLoaded };
}

// ==========================================
// 2. ACTIONS HOOK (Handles Business Logic)
// ==========================================
function useHistoryActions(setHistory) {
  
  const addHistoryItem = useCallback((item) => {
    if (!item || typeof item !== 'object') return;
    
    const newItem = {
      id: item.id ? String(item.id) : `doc-${Date.now()}`,
      name: item.name && item.name.trim() ? item.name : 'Untitled',
      type: item.type || 'chat', 
      createdAt: item.createdAt || Date.now(),
      lastActivityAt: Date.now(),
      messages: item.messages || [], 
      status: item.status || 'completed', 
      ...item
    };

    setHistory((prev) => {
      const others = prev.filter((it) => it.id !== newItem.id);
      return [newItem, ...others];
    });
    
    return newItem.id;
  }, [setHistory]);

  const updateHistoryItem = useCallback((id, updates) => {
    setHistory((prev) => 
      prev.map((item) => 
        item.id === id ? { ...item, ...updates, lastActivityAt: Date.now() } : item
      )
    );
  }, [setHistory]);

  const deleteHistoryItem = useCallback((id) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, [setHistory]);

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
  }, [setHistory]);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear storage', e);
    }
  }, [setHistory]);

  return { addHistoryItem, updateHistoryItem, deleteHistoryItem, addMessageToItem, clearHistory };
}

// ==========================================
// 3. MAIN CONTEXT PROVIDER
// ==========================================
export function HistoryProvider({ children }) {
  // 1. Initialize Storage
  const { history, setHistory, isLoaded } = useHistoryStorage(STORAGE_KEY);
  
  // 2. Initialize Actions
  const actions = useHistoryActions(setHistory);

  // 3. Memoize the Provider Value
  const value = useMemo(() => ({
    history,
    isLoaded, // Added this so your app can show a splash screen while loading!
    ...actions
  }), [history, isLoaded, actions]);

  return (
    <HistoryContext.Provider value={value}>
      {children}
    </HistoryContext.Provider>
  );
}

// ==========================================
// 4. CONSUMER HOOK
// ==========================================
export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within a HistoryProvider');
  return ctx;
}