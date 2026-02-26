import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';
import DiagramPanel from './DiagramPanel';
import ChatPanel from './ChatPanel';

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentInfoPanel() {
  const { document: doc, currentImageIndex } = useDocumentContext();
  if (!doc) return null;

  const file = doc.file || {};
  const images = doc.images || [];
  const isPdf = doc.type === 'pdf' && images.length > 0;
  const components = isPdf
    ? (images[currentImageIndex]?.ar_components || [])
    : (doc.ar?.components || []);
  const connections = doc.ar?.relationships?.connections || [];

  const avgConfidence = components.length > 0
    ? (components.reduce((s, c) => s + (c.confidence || 0), 0) / components.length * 100).toFixed(0)
    : 0;

  return (
    <div className="doc-info-panel">
      <div className="doc-info-section">
        <div className="doc-info-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          File Details
        </div>
        <div className="doc-info-grid">
          <div className="doc-info-item">
            <span className="doc-info-label">Name</span>
            <span className="doc-info-value">{file.original_name || file.name || 'Unknown'}</span>
          </div>
          <div className="doc-info-item">
            <span className="doc-info-label">Type</span>
            <span className="doc-info-value doc-info-badge">{(file.extension || file.type || '').replace('.', '').toUpperCase() || '—'}</span>
          </div>
          <div className="doc-info-item">
            <span className="doc-info-label">Size</span>
            <span className="doc-info-value">{formatFileSize(file.size)}</span>
          </div>
          {isPdf && (
            <div className="doc-info-item">
              <span className="doc-info-label">Pages</span>
              <span className="doc-info-value">{images.length}</span>
            </div>
          )}
        </div>
      </div>

      <div className="doc-info-section">
        <div className="doc-info-section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Analysis Results{isPdf ? ` (Page ${currentImageIndex + 1})` : ''}
        </div>
        <div className="doc-info-stats">
          <div className="doc-stat-card">
            <div className="doc-stat-value">{components.length}</div>
            <div className="doc-stat-label">Components</div>
          </div>
          <div className="doc-stat-card">
            <div className="doc-stat-value">{connections.length}</div>
            <div className="doc-stat-label">Connections</div>
          </div>
          <div className="doc-stat-card">
            <div className="doc-stat-value">{avgConfidence}%</div>
            <div className="doc-stat-label">Avg Confidence</div>
          </div>
        </div>
      </div>

      {components.length > 0 && (
        <div className="doc-info-section">
          <div className="doc-info-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Component List
          </div>
          <div className="doc-info-component-list">
            {components.map((comp, idx) => (
              <div key={comp.id} className="doc-info-comp-row">
                <span className="doc-info-comp-idx">{idx + 1}</span>
                <span className="doc-info-comp-name">{comp.label || comp.id}</span>
                <span className="doc-info-comp-conf">{(comp.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceView() {
  const [viewMode, setViewMode] = useState('split');
  const { pendingQuestion, document: doc } = useDocumentContext();
  const [splitPercent, setSplitPercent] = useState(55);
  const isDragging = useRef(false);
  const containerRef = useRef(null);

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

  const fileName = doc?.file?.original_name || doc?.file?.name || 'Document';

  return (
    <div className="workspace-view">
      <div className="workspace-header">
        <div className="workspace-doc-name">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="workspace-doc-title">{fileName}</span>
        </div>
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
            Split
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
          <button
            className={`mode-btn ${viewMode === 'info' ? 'active' : ''}`}
            onClick={() => setViewMode('info')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Info
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
        {viewMode === 'info' && (
          <div className="panel-wrapper">
            <DocumentInfoPanel />
          </div>
        )}
      </div>
    </div>
  );
}