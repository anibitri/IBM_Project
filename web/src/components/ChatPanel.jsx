import React, { useState, useRef, useEffect } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';

// Simple markdown renderer: bold, italic, bullet lists, line breaks
function renderMarkdown(text) {
  if (!text) return null;
  // Split into paragraphs by double newline
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, pi) => {
    // Check if it's a bullet list
    const lines = para.split('\n');
    const isList = lines.every((l) => /^\s*[-*•]\s/.test(l) || l.trim() === '');
    if (isList) {
      const items = lines.filter((l) => l.trim());
      return (
        <ul key={pi} className="md-list">
          {items.map((item, ii) => (
            <li key={ii}>{formatInline(item.replace(/^\s*[-*•]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    // Regular paragraph
    return (
      <p key={pi} className="md-para">
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {formatInline(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function formatInline(text) {
  // Process bold (**text**), then italic (*text*), then code (`text`)
  const parts = [];
  let remaining = text;
  let key = 0;
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{remaining.slice(lastIndex, match.index)}</span>);
    }
    if (match[2]) {
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(<code key={key++} className="md-code">{match[4]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < remaining.length) {
    parts.push(<span key={key++}>{remaining.slice(lastIndex)}</span>);
  }
  return parts.length ? parts : text;
}

export default function ChatPanel() {
  const { chatHistory, askQuestion, loading, pendingQuestion, consumePendingQuestion } = useDocumentContext();
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
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
    setIsAsking(true);
    try {
      await askQuestion(query);
    } catch (err) {
      console.error('Chat error:', err);
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