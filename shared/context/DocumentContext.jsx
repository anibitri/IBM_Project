import React, { createContext, useContext, useState, useCallback } from 'react';
import { backend } from '../api/backend';

const DocumentContext = createContext(null);

export const DocumentProvider = ({ children }) => {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);

  const uploadAndProcess = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    setChatHistory([]);

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
  }, []);

  const addMessage = useCallback((role, content) => {
    setChatHistory((prev) => [...prev, { role, content }]);
  }, []);

  const askQuestion = useCallback(async (query) => {
    if (!document) throw new Error('No document loaded');

    setLoading(true);
    setError(null);

    try {
      addMessage('user', query);

      const context = {
        text_excerpt: document.text_excerpt || '',
        vision: document.vision || {},
        components: document.ar?.components || [],
      };

      const recentHistory = chatHistory.slice(-10);
      const result = await backend.askQuestion(query, context, recentHistory);

      addMessage('assistant', result.answer);
      return result.answer;
    } catch (err) {
      setError(err.message || 'Failed to get answer');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [document, chatHistory, addMessage]);

  const clearChat = useCallback(() => {
    setChatHistory([]);
  }, []);

  const clearDocument = useCallback(() => {
    setDocument(null);
    setChatHistory([]);
    setError(null);
  }, []);

  const value = {
    document,
    loading,
    error,
    chatHistory,
    uploadAndProcess,
    askQuestion,
    addMessage,
    clearChat,
    clearDocument,
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