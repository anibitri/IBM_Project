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

export const MobileDocumentProvider = ({ children }) => {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const chatHistoryRef = useRef(chatHistory);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

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

      setDocument({
        storedName,
        file: { ...uploadResult.file, url: file.uri || uploadResult.file.url },
        ...processResult,
      });
    } catch (err) {
      setError(err.message || 'Failed to process document');
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
      setDocument({
        storedName: 'demo',
        file: {
          original_name: 'demo_architecture.png',
          stored_name: 'demo',
          type: 'image/png',
          size: 245000,
          url: null,
        },
        ...processResult,
      });
    } catch (err) {
      setError(err.message || 'Failed to load demo');
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

  const clearDocument = useCallback(() => {
    setDocument(null);
    setChatHistory([]);
    setError(null);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(0);
  }, []);

  const clearError = useCallback(() => setError(null), []);

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
    recentSessions: [],
    uploadAndProcess,
    loadDemo,
    askQuestion,
    askAboutComponent,
    consumePendingQuestion,
    addMessage,
    clearChat,
    clearError,
    clearDocument,
    restoreSession: () => {},
    removeSession: () => {},
    renameSession: () => {},
    clearAllHistory: () => {},
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
