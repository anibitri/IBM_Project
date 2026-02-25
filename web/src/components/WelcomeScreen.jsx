import React, { useCallback } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';

export default function WelcomeScreen() {
  const { uploadAndProcess, loading, error } = useDocumentContext();

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        uploadAndProcess(e.dataTransfer.files[0]);
      }
    },
    [uploadAndProcess]
  );

  const handleFileSelect = useCallback(
    (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadAndProcess(e.target.files[0]);
      }
    },
    [uploadAndProcess]
  );

  if (loading) {
    return (
      <div className="welcome-screen">
        <div className="welcome-content">
          <div className="processing-container">
            <div className="spinner"></div>
            <h2 className="processing-title">Analyzing Document</h2>
            <p className="processing-subtitle">This may take a few moments</p>
            <div className="processing-steps">
              <div className="step">
                <div className="step-indicator"></div>
                <span>Vision analysis</span>
              </div>
              <div className="step">
                <div className="step-indicator"></div>
                <span>Component detection</span>
              </div>
              <div className="step">
                <div className="step-indicator"></div>
                <span>AI summary generation</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-header">
          <h1 className="welcome-title">Technical Diagram Analysis</h1>
          <p className="welcome-subtitle">
            Upload circuit diagrams, system architectures, or network topologies for AI-powered
            analysis and component detection.
          </p>
        </div>

        <div
          className="upload-zone"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-input"
            accept=".png,.jpg,.jpeg,.pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <label htmlFor="file-input" className="upload-label">
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div className="upload-text">
              <span className="upload-main">Click to upload or drag and drop</span>
              <span className="upload-sub">PNG, JPG, PDF (max. 50MB)</span>
            </div>
          </label>
        </div>

        {error && (
          <div className="error-message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
              <line x1="12" y1="8" x2="12" y2="12" strokeWidth={2} />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth={2} />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="capabilities">
          <div className="capability-item">
            <div className="capability-icon">🔍</div>
            <div className="capability-content">
              <div className="capability-title">Component Detection</div>
              <div className="capability-desc">
                Automatically identify and label technical components
              </div>
            </div>
          </div>
          <div className="capability-item">
            <div className="capability-icon">📐</div>
            <div className="capability-content">
              <div className="capability-title">AR Overlays</div>
              <div className="capability-desc">Interactive bounding boxes with confidence scores</div>
            </div>
          </div>
          <div className="capability-item">
            <div className="capability-icon">💬</div>
            <div className="capability-content">
              <div className="capability-title">Conversational Analysis</div>
              <div className="capability-desc">Ask questions about diagram structure and purpose</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}