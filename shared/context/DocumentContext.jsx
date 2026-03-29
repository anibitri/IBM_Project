import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { backend } from '../api/backend';
import { buildChatContext, buildComponentQuestion } from '../utils/contextBuilder';
import { deriveSessionName } from '../utils/sessionUtils';

const DocumentContext = createContext(null);

const HISTORY_KEY = 'ar-viewer-history';
const MAX_HISTORY = 20;

// Platform-safe storage: localStorage on web, no-op on React Native
const hasLocalStorage =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function loadHistory() {
  if (!hasLocalStorage) return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  if (!hasLocalStorage) return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch { /* quota exceeded — silently ignore */ }
}

export const DocumentProvider = ({ children }) => {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [recentSessions, setRecentSessions] = useState(() => loadHistory());
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Ref ensures async callbacks always read the latest chat history
  const chatHistoryRef = useRef(chatHistory);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  // Persist session history to localStorage on every change
  useEffect(() => {
    saveHistory(recentSessions);
  }, [recentSessions]);

  const _saveCurrentToHistory = useCallback(() => {
    if (!document) return;
    const session = {
      id: document.storedName || Date.now().toString(),
      fileName: deriveSessionName(document),
      storedName: document.storedName,
      file: document.file,
      componentCount: document.ar?.componentCount || document.ar?.components?.length || 0,
      messageCount: chatHistory.length,
      chatHistory,
      ai_summary: document.ai_summary,
      timestamp: Date.now(),
      documentData: document,
    };
    setRecentSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== session.id);
      return [session, ...filtered].slice(0, MAX_HISTORY);
    });
  }, [document, chatHistory]);

  const uploadAndProcess = useCallback(async (file) => {
    if (document) _saveCurrentToHistory();
    setLoading(true);
    setError(null);
    setChatHistory([]);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(0);

    try {
      const uploadResult = await backend.uploadFile(file);
      const storedName = uploadResult.file.stored_name;
      const processResult = await backend.processDocument(storedName, true, true);

      setDocument({
        storedName,
        file: uploadResult.file,
        ...processResult,
      });
    } catch (err) {
      setError(err.message || 'Failed to process document');
    } finally {
      setLoading(false);
    }
  }, [document, _saveCurrentToHistory]);

  const addMessage = useCallback((role, content) => {
    setChatHistory((prev) => [...prev, { role, content }]);
  }, []);

  const askQuestion = useCallback(async (query) => {
    if (!document) throw new Error('No document loaded');
    setError(null);

    try {
      addMessage('user', query);

      const context = buildChatContext(document, currentImageIndex);
      const recentHistory = chatHistoryRef.current.slice(-10);
      const result = await backend.askQuestion(query, context, recentHistory);

      addMessage('assistant', result.answer);
      return result.answer;
    } catch (err) {
      setError(err.message || 'Failed to get answer');
      throw err;
    }
  }, [document, currentImageIndex, addMessage]);

  const askAboutComponent = useCallback((component) => {
    const connections =
      document?.ar?.connections ||
      document?.ar?.relationships?.connections ||
      [];
    setPendingQuestion(buildComponentQuestion(component, connections));
  }, [document]);

  const consumePendingQuestion = useCallback(() => {
    const q = pendingQuestion;
    setPendingQuestion(null);
    return q;
  }, [pendingQuestion]);

  const clearChat = useCallback(() => {
    setChatHistory([]);
  }, []);

  const clearDocument = useCallback(() => {
    if (document) _saveCurrentToHistory();
    setDocument(null);
    setChatHistory([]);
    setError(null);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(0);
  }, [document, _saveCurrentToHistory]);

  const restoreSession = useCallback((session) => {
    if (document) _saveCurrentToHistory();
    if (session.documentData) {
      setDocument(session.documentData);
      setChatHistory(session.chatHistory || []);
      setError(null);
      setPendingQuestion(null);
    }
  }, [document, _saveCurrentToHistory]);

  const removeSession = useCallback((sessionId) => {
    setRecentSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const renameSession = useCallback((sessionId, newName) => {
    setRecentSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, fileName: newName } : s))
    );
  }, []);

  const clearAllHistory = useCallback(() => {
    setRecentSessions([]);
    setDocument(null);
    setChatHistory([]);
    setError(null);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(0);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    document,
    loading,
    error,
    chatHistory,
    recentSessions,
    pendingQuestion,
    selectedComponent,
    setSelectedComponent,
    currentImageIndex,
    setCurrentImageIndex,
    uploadAndProcess,
    askQuestion,
    askAboutComponent,
    consumePendingQuestion,
    addMessage,
    clearChat,
    clearError,
    clearDocument,
    restoreSession,
    removeSession,
    renameSession,
    clearAllHistory,
  };

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
};

export const useDocumentContext = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useDocumentContext must be used within a DocumentProvider');
  }
  return context;
};
