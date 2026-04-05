/**
 * Mobile DocumentProvider — wraps shared context with mock backend support.
 *
 * When USE_MOCK_BACKEND is true (default for now), all backend calls are
 * handled locally with simulated data so the app works without a server.
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { mockBackend } from '../mocks/mockBackend';
import { buildChatContext, buildComponentQuestion, makeSessionId, resolveBaseURL } from '@ar-viewer/shared';

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

  // Track the AbortController and job_id for the currently in-progress analysis
  // so we can cancel both the HTTP request and the server-side processing.
  const processingAbortRef = useRef(null);
  const activeJobIdRef     = useRef(null);

  const cancelAnalysis = useCallback(() => {
    if (processingAbortRef.current) {
      processingAbortRef.current.abort();
      processingAbortRef.current = null;
    }
    if (activeJobIdRef.current) {
      backend.cancelProcessing(activeJobIdRef.current);
      activeJobIdRef.current = null;
    }
  }, []);

  // Cancel any running analysis when the provider unmounts
  useEffect(() => () => cancelAnalysis(), []);

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

  // ── Builds per-page image URLs from the process result ──────────────────────
  const buildImagesWithUrls = (processResult, uploadResult, file) => {
    const originalUri = file.uri || null;
    const fileType = (file.type || uploadResult.file?.type || '').toLowerCase();
    const fileName = (file.name || uploadResult.file?.original_name || '').toLowerCase();
    const isPDF = fileType.includes('pdf') || fileName.endsWith('.pdf');

    const apiBase = resolveBaseURL().replace(/\/api\/?$/, '');
    const staticBase = `${apiBase}/static/uploads/`;

    return (processResult.images || []).map((img, idx) => {
      // For image uploads: always display from the local gallery URI — server URLs
      // may be behind ngrok/auth headers that the native Image component can't send.
      // For PDFs: page images come from the server (no local per-page URIs exist).
      const relPath = img.image_path
        ? img.image_path.replace(/\\/g, '/').split('uploads/').pop()
        : img.image_filename;
      const serverUrl = relPath ? `${staticBase}${relPath}` : null;
      const url = (!isPDF && idx === 0 && originalUri) ? originalUri : serverUrl;
      return { ...img, url };
    });
  };

  // ── Upload & Process ────────────────────────────────────
  const uploadAndProcess = useCallback(async (file) => {
    // Cancel any previous in-progress analysis before starting a new one
    cancelAnalysis();

    const controller = new AbortController();
    processingAbortRef.current = controller;
    activeJobIdRef.current     = null; // will be set via onJobId once the server assigns one

    setLoading(true);
    setError(null);
    setChatHistory([]);
    setPendingQuestion(null);
    setSelectedComponent(null);
    setCurrentImageIndex(0);

    try {
      const uploadResult = await backend.uploadFile(file, { signal: controller.signal });
      const storedName = uploadResult.file.stored_name;
      const processResult = await backend.processDocument(storedName, true, true, {
        signal: controller.signal,
        onJobId: (id) => { activeJobIdRef.current = id; },
      });

      const imagesWithUrls = buildImagesWithUrls(processResult, uploadResult, file);

      const nextDocument = {
        sessionId: makeSessionId(),
        storedName,
        ...processResult,
        images: imagesWithUrls,
        // Must come after ...processResult so processResult.file doesn't overwrite the local URI
        file: {
          ...uploadResult.file,
          url: file.uri || uploadResult.file.url,
          captureSource: file.captureSource || null,
          clientWidth: file.clientWidth || null,
          clientHeight: file.clientHeight || null,
          orientation: file.orientation || null,
        },
      };
      // Default to first page if multi-page, otherwise all-pages view
      setCurrentImageIndex(imagesWithUrls.length > 1 ? 0 : -1);
      setDocument(nextDocument);
      upsertSession(nextDocument, []);
      return true;
    } catch (err) {
      const jobId = activeJobIdRef.current;
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
        backend.cancelProcessing(jobId);
        return false;
      }
      backend.cancelProcessing(jobId);
      setError(err.message || 'Failed to process document');
      return false;
    } finally {
      processingAbortRef.current = null;
      activeJobIdRef.current     = null;
      setLoading(false);
    }
  }, [cancelAnalysis]);

  // ── Attach document to existing session (keeps session ID / name / history) ──
  const attachDocumentToSession = useCallback(async (file) => {
    // Cancel any previous in-progress analysis before starting a new one
    cancelAnalysis();

    const controller = new AbortController();
    processingAbortRef.current = controller;
    activeJobIdRef.current     = null; // will be set via onJobId once the server assigns one

    setLoading(true);
    setError(null);

    const savedSessionId   = document?.sessionId || makeSessionId();
    const savedSessionName = document?.sessionName || 'New Chat';
    const savedChatHistory = [...(chatHistoryRef.current || [])];

    try {
      const uploadResult = await backend.uploadFile(file, { signal: controller.signal });
      const storedName = uploadResult.file.stored_name;
      const processResult = await backend.processDocument(storedName, true, true, {
        signal: controller.signal,
        onJobId: (id) => { activeJobIdRef.current = id; },
      });

      const imagesWithUrls = buildImagesWithUrls(processResult, uploadResult, file);

      const updatedDocument = {
        sessionId: savedSessionId,
        sessionName: savedSessionName,
        storedName,
        ...processResult,
        images: imagesWithUrls,
        // Must come after ...processResult so processResult.file doesn't overwrite the local URI
        file: {
          ...uploadResult.file,
          url: file.uri || uploadResult.file.url,
          captureSource: file.captureSource || null,
          clientWidth: file.clientWidth || null,
          clientHeight: file.clientHeight || null,
          orientation: file.orientation || null,
        },
      };

      setCurrentImageIndex(imagesWithUrls.length > 1 ? 0 : -1);
      setDocument(updatedDocument);
      setChatHistory(savedChatHistory);
      upsertSession(updatedDocument, savedChatHistory);
      return true;
    } catch (err) {
      const jobId = activeJobIdRef.current;
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
        backend.cancelProcessing(jobId);
        return false;
      }
      backend.cancelProcessing(jobId);
      setError(err.message || 'Failed to attach document');
      return false;
    } finally {
      processingAbortRef.current = null;
      activeJobIdRef.current     = null;
      setLoading(false);
    }
  }, [document, upsertSession, cancelAnalysis]);

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

  const askQuestion = useCallback(async (query, questionContext = null) => {
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

      const normalizedQuestionContext =
        questionContext && typeof questionContext === 'object'
          ? questionContext
          : null;

      const requestedScope = normalizedQuestionContext?.scope || null;
      const requestedPageIndex = Number.isInteger(normalizedQuestionContext?.pageIndex)
        ? normalizedQuestionContext.pageIndex
        : null;

      const scopedPageIndex = requestedScope === 'document'
        ? -1
        : requestedPageIndex ?? currentImageIndexRef.current;

      const context = activeDoc?.file ? buildChatContext(activeDoc, scopedPageIndex) : {};

      const selectedComponent = normalizedQuestionContext?.selectedComponent || null;
      const selectedPage =
        scopedPageIndex >= 0 && (activeDoc?.images || [])[scopedPageIndex]
          ? (activeDoc.images || [])[scopedPageIndex]
          : null;

      // When a specific page/diagram is selected, override stored_name with the
      // page's own image file path (relative to the uploads folder) so the backend
      // runs vision Q&A against the correct image instead of the original document
      // file (which may be a PDF and cannot be opened by the vision model).
      if (selectedPage) {
        const pageRelPath = selectedPage.image_path
          ? selectedPage.image_path.replace(/\\/g, '/').split('uploads/').pop()
          : selectedPage.image_filename;
        if (pageRelPath) {
          context.stored_name = pageRelPath;
        }
      }

      context.request_scope = requestedScope || (scopedPageIndex === -1 ? 'document' : 'diagram');
      context.frontend_question_context = {
        source: normalizedQuestionContext?.source || 'chat',
        scope: context.request_scope,
        page_index: scopedPageIndex,
        page_number: selectedPage?.page || (scopedPageIndex >= 0 ? scopedPageIndex + 1 : null),
        selected_diagram: {
          page_index: scopedPageIndex,
          page_number: selectedPage?.page || (scopedPageIndex >= 0 ? scopedPageIndex + 1 : null),
          image_filename: selectedPage?.image_filename || selectedPage?.image_path || null,
          total_pages: activeDoc?.images?.length || 0,
        },
        selected_component: selectedComponent
          ? {
              id: selectedComponent.id || null,
              label: selectedComponent.label || '',
              type: selectedComponent.type || '',
              description: selectedComponent.description || '',
              confidence:
                typeof selectedComponent.confidence === 'number'
                  ? selectedComponent.confidence
                  : null,
            }
          : null,
      };

      if (context.request_scope === 'component' && selectedComponent) {
        context.focus_component = {
          id: selectedComponent.id || null,
          label: selectedComponent.label || '',
          type: selectedComponent.type || '',
          description: selectedComponent.description || '',
        };
      }

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
    setPendingQuestion({
      text: buildComponentQuestion(component, connections),
      context: {
        source: 'component-shortcut',
        scope: 'component',
        pageIndex: currentImageIndexRef.current,
        selectedComponent: component
          ? {
              id: component.id || null,
              label: component.label || '',
              type: component.type || '',
              description: component.description || '',
              confidence: typeof component.confidence === 'number' ? component.confidence : null,
            }
          : null,
      },
    });
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
    cancelAnalysis,
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
