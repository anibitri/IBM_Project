import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { backend } from '../api/backend';

const DocumentContext = createContext(null);

const HISTORY_KEY = 'ar-viewer-history';
const MAX_HISTORY = 20;

// Platform-safe storage: localStorage on web, no-op on React Native
const hasLocalStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

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
  } catch { /* quota exceeded */ }
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

  // Ref to always have current chatHistory without stale closures
  const chatHistoryRef = useRef(chatHistory);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  // Persist history whenever it changes
  useEffect(() => {
    saveHistory(recentSessions);
  }, [recentSessions]);

  // Derive a short contextual session name from the AI summary or components
  const _deriveSessionName = useCallback((doc) => {
    // Try to extract a meaningful name from AI summary
    const summary = doc?.ai_summary || '';
    if (summary) {
      // Clean prompt artifacts first
      let text = summary;
      const markers = ['Summary:', 'Analysis:', 'Provide a clear'];
      for (const m of markers) {
        const idx = text.lastIndexOf(m);
        if (idx !== -1) text = text.slice(idx + m.length);
      }
      text = text.replace(/^\s+/, '');
      // Take the first meaningful sentence/phrase (up to ~50 chars)
      const firstSentence = text.split(/[.\n]/).find(s => s.trim().length > 10);
      if (firstSentence) {
        let name = firstSentence.trim().replace(/\*+/g, '').substring(0, 50);
        // Trim to last whole word if cut mid-word
        if (name.length === 50) {
          const lastSpace = name.lastIndexOf(' ');
          if (lastSpace > 20) name = name.substring(0, lastSpace);
        }
        return name;
      }
    }
    // Fallback: use component labels if available
    const components = doc?.ar?.components || [];
    if (components.length > 0) {
      const labels = components.slice(0, 3).map(c => c.label).filter(Boolean);
      if (labels.length > 0) return labels.join(', ');
    }
    // Last resort: filename without extension
    const rawName = doc?.file?.original_name || doc?.file?.name || 'Untitled';
    return rawName.replace(/\.[^.]+$/, '');
  }, []);

  // Save current session to history
  const _saveCurrentToHistory = useCallback(() => {
    if (!document) return;
    const session = {
      id: document.storedName || Date.now().toString(),
      fileName: _deriveSessionName(document),
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
  }, [document, chatHistory, _deriveSessionName]);

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

      const context = {
        text_excerpt: document.text_excerpt || '',
        vision: document.vision || {},
        components: document.ar?.components || [],
        connections: document.ar?.connections || document.ar?.relationships?.connections || [],
        stored_name: document.storedName || '',
      };

      // Use ref to get current history (avoids stale closure)
      const recentHistory = chatHistoryRef.current.slice(-10);
      const result = await backend.askQuestion(query, context, recentHistory);

      addMessage('assistant', result.answer);
      return result.answer;
    } catch (err) {
      setError(err.message || 'Failed to get answer');
      throw err;
    }
  }, [document, addMessage]);

  const askAboutComponent = useCallback((component) => {
    // Find connections that involve this component
    const connections = document?.ar?.connections || document?.ar?.relationships?.connections || [];
    const related = connections
      .filter(c => c.from === component.id || c.to === component.id)
      .map(c => {
        const otherLabel = c.from === component.id
          ? (c.to_label || c.to)
          : (c.from_label || c.from);
        return otherLabel;
      });

    let question;
    if (related.length > 0) {
      const connList = related.join(', ');
      question = `Tell me about the "${component.label}" component. It is connected to: ${connList}. What is its function, and how does it interact with these connected components?`;
    } else {
      question = `Tell me about the "${component.label}" component. What is its function, and how does it relate to the other components in this diagram?`;
    }
    setPendingQuestion(question);
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