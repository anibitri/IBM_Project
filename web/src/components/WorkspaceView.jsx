import React, { useState, useEffect, useCallback } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';
import DiagramPanel from './DiagramPanel';
import ChatPanel from './ChatPanel';

/* ── helpers ─────────────────────────────────────────────── */

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Document Browser Panel (PDF iframe / image viewer) ── */

function DocumentBrowserPanel() {
  const { document: doc } = useDocumentContext();
  if (!doc) return null;

  const isPdf = doc.type === 'pdf' || doc.file?.extension === '.pdf';
  const fileUrl = doc.file?.url || `/static/uploads/${doc.storedName}`;

  if (isPdf) {
    return (
      <div className="document-browser-panel">
        <div className="document-browser-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{doc.file?.original_name || doc.file?.name || 'Document'}</span>
        </div>
        <iframe
          src={fileUrl}
          title="Document Viewer"
          className="document-browser-iframe"
        />
      </div>
    );
  }

  /* For images — display the original uploaded image */
  return (
    <div className="document-browser-panel">
      <div className="document-browser-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span>{doc.file?.original_name || doc.file?.name || 'Image'}</span>
      </div>
      <div className="document-browser-image-wrap">
        <img
          src={fileUrl}
          alt="Uploaded document"
          className="document-browser-image"
        />
      </div>
    </div>
  );
}

/* ── Document Info Panel ─────────────────────────────────── */

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
                <span className="doc-info-comp-conf">{((comp.confidence ?? 0) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Panel definitions ───────────────────────────────────── */

const PANELS = [
  {
    id: 'diagram',
    label: 'Diagram',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    id: 'document',
    label: 'Document',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    id: 'info',
    label: 'Info',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

/* ── Render the correct component for a panel id ─────────── */

function PanelContent({ panelId }) {
  switch (panelId) {
    case 'diagram':  return <DiagramPanel />;
    case 'document': return <DocumentBrowserPanel />;
    case 'chat':     return <ChatPanel />;
    case 'info':     return <DocumentInfoPanel />;
    default:         return null;
  }
}

/* ── Main workspace ──────────────────────────────────────── */

export default function WorkspaceView() {
  const [activePanels, setActivePanels] = useState(['diagram', 'chat']);
  const { pendingQuestion, document: doc } = useDocumentContext();

  /* Auto-open chat when a pending question arrives */
  useEffect(() => {
    if (pendingQuestion && !activePanels.includes('chat')) {
      setActivePanels((prev) => [...prev, 'chat']);
    }
  }, [pendingQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Toggle a panel on / off (at least 1 must stay open) */
  const togglePanel = useCallback((panelId) => {
    setActivePanels((prev) => {
      if (prev.includes(panelId)) {
        if (prev.length <= 1) return prev; // keep at least one
        return prev.filter((p) => p !== panelId);
      }
      return [...prev, panelId];
    });
  }, []);

  const fileName = doc?.file?.original_name || doc?.file?.name || 'Document';

  return (
    <div className="workspace-view">
      {/* ── header toolbar ───────────────────────────────── */}
      <div className="workspace-header">
        <div className="workspace-doc-name">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="workspace-doc-title">{fileName}</span>
        </div>

        <div className="panel-toggles">
          {PANELS.map((panel) => {
            const isActive = activePanels.includes(panel.id);
            return (
              <button
                key={panel.id}
                className={`panel-toggle-btn ${isActive ? 'active' : ''}`}
                onClick={() => togglePanel(panel.id)}
                title={`${isActive ? 'Hide' : 'Show'} ${panel.label}`}
              >
                {panel.icon}
                <span className="panel-toggle-label">{panel.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── panels area ──────────────────────────────────── */}
      <div className="workspace-content workspace-multi-panel">
        {activePanels.map((panelId, index) => (
          <React.Fragment key={panelId}>
            {index > 0 && <div className="panel-divider" />}
            <div className="panel-wrapper">
              <PanelContent panelId={panelId} />
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}