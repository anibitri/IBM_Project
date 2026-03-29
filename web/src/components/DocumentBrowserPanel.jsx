import React from 'react';
import { useDocumentContext } from '@ar-viewer/shared/context/DocumentContext';

/**
 * Renders the raw uploaded file — a PDF inside an <iframe> or an <img>
 * for image files — so the user can read the original document alongside
 * the AI analysis panels.
 */
export default function DocumentBrowserPanel() {
  const { document: doc } = useDocumentContext();
  if (!doc) return null;

  const isPdf = doc.type === 'pdf' || doc.file?.extension === '.pdf';
  const fileUrl = doc.file?.url || `/static/uploads/${doc.storedName}`;
  const fileName = doc.file?.original_name || doc.file?.name;

  if (isPdf) {
    return (
      <div className="document-browser-panel">
        <div className="document-browser-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{fileName || 'Document'}</span>
        </div>
        <iframe
          src={fileUrl}
          title="Document Viewer"
          className="document-browser-iframe"
        />
      </div>
    );
  }

  return (
    <div className="document-browser-panel">
      <div className="document-browser-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span>{fileName || 'Image'}</span>
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
