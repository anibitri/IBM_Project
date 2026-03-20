/**
 * Mobile DocumentProvider — wraps shared context with mock backend support.
 *
 * When USE_MOCK_BACKEND is true (default for now), all backend calls are
 * handled locally with simulated data so the app works without a server.
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { mockBackend } from '../mocks/mockBackend';

const USE_MOCK_BACKEND = true; // flip to false when the real backend is reachable

const api = USE_MOCK_BACKEND ? mockBackend : null; // real backend imported lazily below
let realBackend = null;
if (!USE_MOCK_BACKEND) {
  try {
    realBackend = require('@ar-viewer/shared').backend;
  } catch {
    // fallback
  }
}
const backend = api || realBackend;

const DocumentContext = createContext(null);

function makeSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const MobileDocumentProvider = ({ children }) => {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [recentSessions, setRecentSessions] = useState([]);
  const [accessibilitySettings, setAccessibilitySettings] = useState({
    darkMode: false,
  });

  const chatHistoryRef = useRef(chatHistory);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  const getNextNewChatName = useCallback((extraNames = []) => {
    const usedNumbers = new Set();
    [...recentSessions.map((s) => s?.fileName), ...extraNames].forEach((rawName) => {
      const name = (rawName || '').trim();
      if (!name) return;
      if (name === 'New Chat') {
        usedNumbers.add(1);
        return;
      }

      const match = name.match(/^New Chat\s+(\d+)$/i);
      if (match) {
        usedNumbers.add(Number(match[1]));
      }
    });

    let next = 1;
    while (usedNumbers.has(next)) {
      next += 1;
    }
    return next === 1 ? 'New Chat' : `New Chat ${next}`;
  }, [recentSessions]);

  const upsertSession = useCallback((doc, historyOverride = null) => {
    if (!doc) return;

    const history = historyOverride || chatHistoryRef.current || [];
    const sessionId = doc.sessionId || makeSessionId();
    const componentCount = doc.ar?.components?.length || 0;

    setRecentSessions((prev) => {
      const existing = prev.find((s) => s.id === sessionId);
      const fileName =
        doc.sessionName ||
        existing?.fileName ||
        doc.file?.original_name ||
        'Untitled';

      const session = {
        id: sessionId,
        storedName: doc.storedName,
        fileName,
        timestamp: Date.now(),
        componentCount,
        messageCount: history.length,
        documentSnapshot: { ...doc, sessionId, sessionName: fileName },
        chatHistory: [...history],
      };

      const filtered = prev.filter((s) => s.id !== sessionId);
      return [session, ...filtered].slice(0, 30);
    });
  }, []);

  useEffect(() => {
    if (document?.sessionId) {
      upsertSession(document);
    }
  }, [document, chatHistory, upsertSession]);

  // ── Upload & Process ────────────────────────────────────
  const uploadAndProcess = useCallback(async (file) => {
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

      const nextDocument = {
        sessionId: makeSessionId(),
        storedName,
        file: { ...uploadResult.file, url: file.uri || uploadResult.file.url },
        ...processResult,
      };
      setDocument(nextDocument);
      upsertSession(nextDocument, []);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to process document');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load demo data instantly (no file needed) ───────────
  const loadDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChatHistory([]);
    setPendingQuestion(null);
    setSelectedComponent(null);

    try {
      const processResult = await backend.processDocument('demo', true, true);
      const nextDocument = {
        sessionId: makeSessionId(),
        storedName: 'demo',
        file: {
          original_name: 'demo_architecture.png',
          stored_name: 'demo',
          type: 'image/png',
          size: 245000,
          url: null,
        },
        ...processResult,
      };
      setDocument(nextDocument);
      upsertSession(nextDocument, []);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to load demo');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Chat ────────────────────────────────────────────────
  const addMessage = useCallback((role, content) => {
    setChatHistory((prev) => [...prev, { role, content }]);
  }, []);

  const askQuestion = useCallback(async (query) => {
    if (!document) throw new Error('No document loaded');
    setError(null);

    try {
      addMessage('user', query);

      const context = {
        text_excerpt: document.full_text || document.text_excerpt || '',
        ai_summary: document.ai_summary || '',
        vision: document.vision || {},
        components: document.ar?.components || [],
        connections: document.ar?.connections || document.ar?.relationships?.connections || [],
        stored_name: document.storedName || '',
      };

      const recentHistory = chatHistoryRef.current.slice(-10);
      const result = await backend.askQuestion(query, context, recentHistory);
      addMessage('assistant', result.answer);
      upsertSession(document, [...recentHistory, { role: 'user', content: query }, { role: 'assistant', content: result.answer }]);
      return result.answer;
    } catch (err) {
      setError(err.message || 'Failed to get answer');
      throw err;
    }
  }, [document, addMessage]);

  const askAboutComponent = useCallback((component) => {
    const connections = document?.ar?.connections || document?.ar?.relationships?.connections || [];
    const related = connections
      .filter(c => c.from === component.id || c.to === component.id)
      .map(c => c.from === component.id ? (c.to_label || c.to) : (c.from_label || c.from));

    const question = related.length > 0
      ? `Tell me about the "${component.label}" component. It is connected to: ${related.join(', ')}. What is its function?`
      : `Tell me about the "${component.label}" component. What is its function?`;
    setPendingQuestion(question);
  }, [document]);

  const consumePendingQuestion = useCallback(() => {
    const q = pendingQuestion;
    setPendingQuestion(null);
    return q;
  }, [pendingQuestion]);

  const clearChat = useCallback(() => setChatHistory([]), []);

  const startNewChat = useCallback(() => {
    if (!document) {
      setChatHistory([]);
      setPendingQuestion(null);
      setSelectedComponent(null);
      setCurrentImageIndex(0);
      return;
    }

    const currentHistory = chatHistoryRef.current || [];
    upsertSession(document, currentHistory);

    const nextName = getNextNewChatName([document.sessionName]);

    const nextDocument = {
      ...document,
      sessionId: makeSessionId(),
      sessionName: nextName,
    };

    setDocument(nextDocument);
    setChatHistory([]);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(0);
    upsertSession(nextDocument, []);
  }, [document, getNextNewChatName, upsertSession]);

  const clearDocument = useCallback(() => {
    setDocument(null);
    setChatHistory([]);
    setError(null);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(0);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const restoreSession = useCallback((session) => {
    if (!session?.documentSnapshot) return;
    setDocument({
      ...session.documentSnapshot,
      sessionName: session.fileName || session.documentSnapshot?.sessionName,
    });
    setChatHistory(session.chatHistory || []);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(0);

    setRecentSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== session.id);
      return [{ ...session, timestamp: Date.now() }, ...filtered];
    });
  }, []);

  const removeSession = useCallback((sessionId) => {
    setRecentSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (document?.sessionId === sessionId) {
      clearDocument();
    }
  }, [document, clearDocument]);

  const renameSession = useCallback((sessionId, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;

    setDocument((prev) => {
      if (!prev || prev.sessionId !== sessionId) return prev;
      return { ...prev, sessionName: trimmed };
    });

    setRecentSessions((prev) => prev.map((s) => (
      s.id === sessionId
        ? {
            ...s,
            fileName: trimmed,
            documentSnapshot: {
              ...s.documentSnapshot,
              sessionName: trimmed,
            },
          }
        : s
    )));
  }, []);

  const setDarkMode = useCallback((value) => {
    setAccessibilitySettings((prev) => ({ ...prev, darkMode: !!value }));
  }, []);

  const clearAllHistory = useCallback(() => {
    setRecentSessions([]);
  }, []);

  const value = {
    document,
    loading,
    error,
    chatHistory,
    pendingQuestion,
    selectedComponent,
    setSelectedComponent,
    currentImageIndex,
    setCurrentImageIndex,
    accessibilitySettings,
    setDarkMode,
    recentSessions,
    uploadAndProcess,
    loadDemo,
    askQuestion,
    askAboutComponent,
    consumePendingQuestion,
    addMessage,
    clearChat,
    startNewChat,
    clearError,
    clearDocument,
    restoreSession,
    removeSession,
    renameSession,
    clearAllHistory,
  };

  return <DocumentContext.Provider value={value}>{children}</DocumentContext.Provider>;
};

export const useMobileDocumentContext = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useMobileDocumentContext must be used within MobileDocumentProvider');
  }
  return context;
};

// Re-export with the same name so screens can import transparently
export { DocumentContext };
