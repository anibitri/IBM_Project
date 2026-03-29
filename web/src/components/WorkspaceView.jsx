import React from 'react';
import { useDocumentContext } from '@ar-viewer/shared/context/DocumentContext';
import DiagramPanel from './DiagramPanel';
import ChatPanel from './ChatPanel';
import DocumentBrowserPanel from './DocumentBrowserPanel';
import DocumentInfoPanel from './DocumentInfoPanel';
import { usePanelManager } from '../hooks/usePanelManager';

/* ── Panel registry ──────────────────────────────────────── */

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

/* ── Panel content router ────────────────────────────────── */

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
  const { pendingQuestion, document: doc } = useDocumentContext();
  const { activePanels, togglePanel } = usePanelManager(['diagram', 'chat'], pendingQuestion);

  const fileName = doc?.file?.original_name || doc?.file?.name || 'Document';

  return (
    <div className="workspace-view">
      {/* Header toolbar */}
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

      {/* Panels area */}
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
