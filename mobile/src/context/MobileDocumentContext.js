/**
 * Mobile DocumentProvider — wraps shared context with mock backend support.
 *
 * When USE_MOCK_BACKEND is true (default for now), all backend calls are
 * handled locally with simulated data so the app works without a server.
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { mockBackend } from '../mocks/mockBackend';
import { buildChatContext, buildComponentQuestion } from '@ar-viewer/shared';
import { makeSessionId } from '@ar-viewer/shared';

const USE_MOCK_BACKEND = false; // flip to false when the real backend is reachable

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


export const MobileDocumentProvider = ({ children }) => {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(-1);
  const [recentSessions, setRecentSessions] = useState([]);
  const [accessibilitySettings, setAccessibilitySettings] = useState({
    darkMode: false,
  });

  const chatHistoryRef = useRef(chatHistory);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  const currentImageIndexRef = useRef(-1);
  useEffect(() => { currentImageIndexRef.current = currentImageIndex; }, [currentImageIndex]);

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

      // Build accessible URLs for per-page images
      const serverFileUrl = uploadResult.file.url || '';
      const hostMatch = serverFileUrl.match(/^https?:\/\/[^/]+/);
      const staticBase = hostMatch ? `${hostMatch[0]}/static/uploads/` : '/static/uploads/';
      const imagesWithUrls = (processResult.images || []).map(img => ({
        ...img,
        url: img.image_filename ? `${staticBase}${img.image_filename}` : null,
      }));

      const nextDocument = {
        sessionId: makeSessionId(),
        storedName,
        file: { ...uploadResult.file, url: file.uri || uploadResult.file.url },
        ...processResult,
        images: imagesWithUrls,
      };
      // Default to first page if multi-page, otherwise all-pages view
      setCurrentImageIndex(imagesWithUrls.length > 1 ? 0 : -1);
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

  // ── Attach document to existing session (keeps session ID / name / history) ──
  const attachDocumentToSession = useCallback(async (file) => {
    setLoading(true);
    setError(null);

    const savedSessionId = document?.sessionId || makeSessionId();
    const savedSessionName = document?.sessionName || 'New Chat';
    const savedChatHistory = [...(chatHistoryRef.current || [])];

    try {
      const uploadResult = await backend.uploadFile(file);
      const storedName = uploadResult.file.stored_name;
      const processResult = await backend.processDocument(storedName, true, true);

      const serverFileUrl = uploadResult.file.url || '';
      const hostMatch = serverFileUrl.match(/^https?:\/\/[^/]+/);
      const staticBase = hostMatch ? `${hostMatch[0]}/static/uploads/` : '/static/uploads/';
      const imagesWithUrls = (processResult.images || []).map(img => ({
        ...img,
        url: img.image_filename ? `${staticBase}${img.image_filename}` : null,
      }));

      const updatedDocument = {
        sessionId: savedSessionId,
        sessionName: savedSessionName,
        storedName,
        file: { ...uploadResult.file, url: file.uri || uploadResult.file.url },
        ...processResult,
        images: imagesWithUrls,
      };

      setCurrentImageIndex(imagesWithUrls.length > 1 ? 0 : -1);
      setDocument(updatedDocument);
      setChatHistory(savedChatHistory);
      upsertSession(updatedDocument, savedChatHistory);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to attach document');
      return false;
    } finally {
      setLoading(false);
    }
  }, [document, upsertSession]);

  // ── Load demo data instantly (no file needed) ───────────
  const loadDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChatHistory([]);
    setPendingQuestion(null);
    setSelectedComponent(null);

    try {
      const processResult = await mockBackend.processDocument('demo', true, true);
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
    setError(null);

    let activeDoc = document;
    if (!activeDoc) {
      const nextName = getNextNewChatName([]);
      activeDoc = {
        sessionId: makeSessionId(),
        sessionName: nextName,
        storedName: null,
        file: null,
        ar: null,
        images: [],
      };
      setDocument(activeDoc);
      upsertSession(activeDoc, []);
    }

    try {
      addMessage('user', query);

      const context = activeDoc?.file ? buildChatContext(activeDoc, currentImageIndexRef.current) : {};
      const recentHistory = chatHistoryRef.current.slice(-10);
      const result = await backend.askQuestion(query, context, recentHistory);
      addMessage('assistant', result.answer);
      upsertSession(activeDoc, [...recentHistory, { role: 'user', content: query }, { role: 'assistant', content: result.answer }]);
      return result.answer;
    } catch (err) {
      setError(err.message || 'Failed to get answer');
      throw err;
    }
  }, [document, addMessage, getNextNewChatName, upsertSession]);

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

  const clearChat = useCallback(() => setChatHistory([]), []);

  const startNewChat = useCallback(() => {
    const currentHistory = chatHistoryRef.current || [];
    if (document) {
      upsertSession(document, currentHistory);
    }

    const nextName = getNextNewChatName([document?.sessionName]);
    const stubDoc = {
      sessionId: makeSessionId(),
      sessionName: nextName,
      storedName: null,
      file: null,
      ar: null,
      images: [],
    };

    setDocument(stubDoc);
    setChatHistory([]);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(-1);
    upsertSession(stubDoc, []);
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
    isMultiPage: (document?.images?.length ?? 0) > 1,
    accessibilitySettings,
    setDarkMode,
    recentSessions,
    uploadAndProcess,
    attachDocumentToSession,
    loadDemo,
    askQuestion,
    askAboutComponent,
    consumePendingQuestion,
    setPendingQuestion,
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
