import React from 'react';
import { useDocumentContext } from '@ar-viewer/shared/context/DocumentContext';

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Displays file metadata and analysis statistics (component count,
 * connection count, average confidence) for the currently loaded document.
 */
export default function DocumentInfoPanel() {
  const { document: doc, currentImageIndex } = useDocumentContext();
  if (!doc) return null;

  const file = doc.file || {};
  const images = doc.images || [];
  const isPdf = doc.type === 'pdf' && images.length > 0;
  const components = isPdf
    ? (images[currentImageIndex]?.ar_components || [])
    : (doc.ar?.components || []);
  const connections = doc.ar?.relationships?.connections || [];

  const avgConfidence =
    components.length > 0
      ? (
          (components.reduce((s, c) => s + (c.confidence || 0), 0) /
            components.length) *
          100
        ).toFixed(0)
      : 0;

  return (
    <div className="doc-info-panel">
      {/* File details */}
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
            <span className="doc-info-value doc-info-badge">
              {(file.extension || file.type || '').replace('.', '').toUpperCase() || '—'}
            </span>
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

      {/* Analysis stats */}
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

      {/* Component list */}
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
                <span className="doc-info-comp-conf">
                  {((comp.confidence ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
