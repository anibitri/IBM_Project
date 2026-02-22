import React, { useState, useRef, useEffect } from 'react';

const ChatInterface = ({ onSendMessage, chatHistory, loading, onClearHistory }) => {
  const [input, setInput] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || localLoading) return;

    const query = input.trim();
    setInput('');
    setLocalLoading(true);

    try {
      await onSendMessage(query);
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h3>💬 Ask Questions</h3>
        <button onClick={onClearHistory} className="clear-btn">Clear</button>
      </div>

      <div className="chat-messages">
        {chatHistory.length === 0 && (
          <div className="chat-placeholder">
            <p>Ask questions about the diagram:</p>
            <ul>
              <li>"What components are shown?"</li>
              <li>"Explain the CPU module"</li>
              <li>"How are components connected?"</li>
            </ul>
          </div>
        )}

        {chatHistory.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-content">
              {msg.content}
            </div>
          </div>
        ))}

        {localLoading && (
          <div className="chat-message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={localLoading || loading}
          className="chat-input"
        />
        <button
          type="submit"
          disabled={!input.trim() || localLoading || loading}
          className="chat-send-btn"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatInterface;