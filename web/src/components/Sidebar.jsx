import React, { useState, useRef, useEffect } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';

export default function Sidebar({ isOpen, onToggle }) {
  const {
    document, clearDocument, chatHistory, recentSessions,
    restoreSession, removeSession, renameSession, askAboutComponent,
    selectedComponent, setSelectedComponent, currentImageIndex,
    clearAllHistory,
  } = useDocumentContext();

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef(null);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus();
  }, [editingId]);

  const handleNewSession = () => {
    clearDocument();
  };

  const startRename = (e, session) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditValue(session.fileName);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      renameSession(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleRenameKey = (e) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') { setEditingId(null); setEditValue(''); }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  // Determine components for current view (per-page for PDFs)
  const images = document?.images || [];
  const isPdf = document?.type === 'pdf' && images.length > 0;
  let components;
  if (isPdf && images.length > 0) {
    const page = images[currentImageIndex] || images[0];
    components = page?.ar_components || [];
  } else {
    components = document?.ar?.components || [];
  }

  const handleComponentClick = (comp) => {
    setSelectedComponent((prev) => (prev?.id === comp.id ? null : comp));
  };

  return (
    <>
      <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            {isOpen && <span className="brand-text">AR Diagram Viewer</span>}
          </div>
        </div>

        <div className="sidebar-actions">
          <button className="new-session-btn" onClick={handleNewSession}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {isOpen && <span>New Analysis</span>}
          </button>
        </div>

        {isOpen && (
          <div className="sidebar-scroll-area">
            {/* Current session */}
            {document && (
              <div className="sidebar-section">
                <div className="section-label">Current</div>
                <div className="history-item active">
                  <div className="history-dot current"></div>
                  <div className="history-content">
                    <div className="history-title">
                      {document.file?.original_name || document.file?.name || 'Current Document'}
                    </div>
                    <div className="history-meta">
                      {components.length} components &middot; {chatHistory.length} messages
                      {isPdf && <> &middot; Page {currentImageIndex + 1}/{images.length}</>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Detected Components — under current item */}
            {document && components.length > 0 && (
              <div className="sidebar-section">
                <div className="section-label">
                  Components
                  <span className="count-badge">{components.length}</span>
                </div>
                <div className="sidebar-components-list">
                  {components.map((comp, idx) => {
                    const isSelected = selectedComponent?.id === comp.id;
                    return (
                      <div
                        key={comp.id}
                        className={`component-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleComponentClick(comp)}
                      >
                        <div className="component-header">
                          <span className="component-index">{idx + 1}</span>
                          <span className="component-name">{comp.label}</span>
                          <span className="component-confidence">
                            {(comp.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        {isSelected && (
                          <div className="component-actions">
                            {comp.description && (
                              <p className="component-desc">{comp.description}</p>
                            )}
                            <button
                              className="ask-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                askAboutComponent(comp);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                              </svg>
                              Ask about this
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent sessions */}
            <div className="sidebar-section">
              <div className="section-label">Recent</div>
              {recentSessions.length > 0 ? (
                <>
                  <div className="history-list">
                    {recentSessions.map((session) => (
                      <div
                        key={session.id}
                        className={`history-item ${document?.storedName === session.id ? 'active' : ''}`}
                        onClick={() => restoreSession(session)}
                      >
                        <div className="history-dot"></div>
                        <div className="history-content">
                          {editingId === session.id ? (
                            <input
                              ref={editInputRef}
                              className="history-rename-input"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={handleRenameKey}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <div className="history-title">{session.fileName}</div>
                          )}
                          <div className="history-meta">
                            {session.componentCount} components &middot; {formatTime(session.timestamp)}
                          </div>
                        </div>
                        <div className="history-actions-group">
                          <button
                            className="history-action-btn"
                            onClick={(e) => startRename(e, session)}
                            title="Rename"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            className="history-action-btn danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSession(session.id);
                            }}
                            title="Remove"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="clear-history-btn" onClick={clearAllHistory}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                    Clear all history
                  </button>
                </>
              ) : (
                <div className="empty-state">
                  <p className="empty-text">No recent documents</p>
                </div>
              )}
            </div>

            <div className="sidebar-footer">
              <div className="app-version">v1.0</div>
            </div>
          </div>
        )}
      </div>

      <button className="sidebar-toggle-mobile" onClick={onToggle}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isOpen ? (
            <path d="M15 18l-6-6 6-6" />
          ) : (
            <path d="M9 18l6-6-6-6" />
          )}
        </svg>
      </button>
    </>
  );
}