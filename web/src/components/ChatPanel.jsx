import React, { useState, useRef, useEffect } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';
import { renderMarkdown } from './markdownUtils';

export default function ChatPanel() {
  const { chatHistory, askQuestion, pendingQuestion, consumePendingQuestion } = useDocumentContext();
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAsking]);

  // Auto-submit pending questions from component selection
  useEffect(() => {
    if (pendingQuestion && !isAsking) {
      const q = consumePendingQuestion();
      if (q) {
        setInput('');
        submitQuestion(q);
      }
    }
  }, [pendingQuestion]);

  const submitQuestion = async (query) => {
    setChatError(null);
    setIsAsking(true);
    try {
      await askQuestion(query);
    } catch (err) {
      setChatError(err.message || 'Failed to get answer. Please try again.');
    } finally {
      setIsAsking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isAsking) return;
    const query = input.trim();
    setInput('');
    await submitQuestion(query);
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        <span>AI Assistant</span>
      </div>
      <div className="chat-container">
        <div className="messages-container">
          {chatHistory.length === 0 ? (
            <div className="chat-welcome">
              <div className="welcome-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <h3>Ask about this diagram</h3>
              <p className="welcome-hint">Select a component and click "Ask about this component", or type a question below.</p>
              <div className="example-prompts">
                <button className="prompt-btn" onClick={() => setInput('What components are detected?')}>
                  What components are detected?
                </button>
                <button className="prompt-btn" onClick={() => setInput('Explain the system architecture')}>
                  Explain the system architecture
                </button>
                <button className="prompt-btn" onClick={() => setInput('What are the main connections?')}>
                  What are the main connections?
                </button>
              </div>
            </div>
          ) : (
            <>
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="10" rx="2" />
                        <circle cx="12" cy="5" r="2" />
                        <path d="M12 7v4" />
                        <line x1="8" y1="16" x2="8" y2="16" />
                        <line x1="16" y1="16" x2="16" y2="16" />
                      </svg>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-text">
                      {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {isAsking && (
                <div className="message assistant">
                  <div className="message-avatar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <circle cx="12" cy="5" r="2" />
                      <path d="M12 7v4" />
                    </svg>
                  </div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {chatError && (
          <div className="chat-error-banner" role="alert">
            <span>{chatError}</span>
            <button className="chat-error-dismiss" onClick={() => setChatError(null)} aria-label="Dismiss error">✕</button>
          </div>
        )}

        <form className="chat-input-container" onSubmit={handleSubmit}>
          <input
            type="text"
            className="chat-input"
            placeholder="Ask about this diagram..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isAsking}
          />
          <button
            type="submit"
            className="send-button"
            aria-label="Send"
            disabled={!input.trim() || isAsking}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}