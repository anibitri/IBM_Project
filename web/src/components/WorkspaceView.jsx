import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';
import DiagramPanel from './DiagramPanel';
import ChatPanel from './ChatPanel';

export default function WorkspaceView() {
  const [viewMode, setViewMode] = useState('split'); // 'diagram', 'chat', 'split'
  const { pendingQuestion } = useDocumentContext();
  const [splitPercent, setSplitPercent] = useState(55); // diagram gets 55%
  const isDragging = useRef(false);
  const containerRef = useRef(null);

  // Auto-switch to split view when a component question is triggered
  useEffect(() => {
    if (pendingQuestion && viewMode === 'diagram') {
      setViewMode('split');
    }
  }, [pendingQuestion]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(25, Math.min(75, pct)));
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="workspace-view">
      <div className="workspace-header">
        <div className="view-mode-toggle">
          <button
            className={`mode-btn ${viewMode === 'diagram' ? 'active' : ''}`}
            onClick={() => setViewMode('diagram')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            Diagram
          </button>
          <button
            className={`mode-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
            Split View
          </button>
          <button
            className={`mode-btn ${viewMode === 'chat' ? 'active' : ''}`}
            onClick={() => setViewMode('chat')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            Chat
          </button>
        </div>
      </div>

      <div ref={containerRef} className={`workspace-content mode-${viewMode}`}>
        {(viewMode === 'diagram' || viewMode === 'split') && (
          <div className="panel-wrapper" style={viewMode === 'split' ? { flex: `0 0 ${splitPercent}%` } : undefined}>
            <DiagramPanel />
          </div>
        )}
        {viewMode === 'split' && (
          <div className="resize-handle" onMouseDown={handleMouseDown}>
            <div className="resize-handle-line" />
          </div>
        )}
        {(viewMode === 'chat' || viewMode === 'split') && (
          <div className="panel-wrapper" style={viewMode === 'split' ? { flex: 1 } : undefined}>
            <ChatPanel />
          </div>
        )}
      </div>
    </div>
  );
}