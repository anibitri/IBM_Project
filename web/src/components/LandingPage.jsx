import React, { useCallback } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';

export default function LandingPage({ loading, error }) {
  const { uploadAndProcess } = useDocumentContext();

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadAndProcess(e.dataTransfer.files[0]);
    }
  }, [uploadAndProcess]);

  const handleFileSelect = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      uploadAndProcess(e.target.files[0]);
    }
  }, [uploadAndProcess]);

  return (
    <main className="landing-page">
      <div className="landing-content">
        {/* Hero Section */}
        <div className="hero-section">
          <h1 className="hero-title">
            <span className="gradient-text">Analyze Technical Diagrams</span>
            <br />
            with AI Vision & AR Overlays
          </h1>
          <p className="hero-description">
            Upload your circuit diagrams, system architectures, or network topologies.
            Get instant AI-powered component detection, AR overlays, and interactive chat.
          </p>
        </div>

        {/* Upload Area */}
        <div
          className={`upload-area ${loading ? 'loading' : ''}`}
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
            disabled={loading}
            style={{ display: 'none' }}
          />
          <label htmlFor="file-input" className="upload-label">
            {loading ? (
              <>
                <div className="spinner-large"></div>
                <h2>Processing Your Document</h2>
                <div className="processing-steps">
                  <div className="step">
                    <span className="step-icon">👁️</span>
                    <span className="step-text">Analyzing with Vision AI</span>
                  </div>
                  <div className="step">
                    <span className="step-icon">📐</span>
                    <span className="step-text">Extracting AR Components</span>
                  </div>
                  <div className="step">
                    <span className="step-icon">🤖</span>
                    <span className="step-text">Generating AI Summary</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="upload-icon">📁</div>
                <h2>Drop your diagram here</h2>
                <p>or click to browse files</p>
                <div className="upload-formats">
                  <span className="format-badge">PNG</span>
                  <span className="format-badge">JPG</span>
                  <span className="format-badge">PDF</span>
                </div>
                <span className="upload-size">Max 50MB</span>
              </>
            )}
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="error-alert">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{error}</span>
            <button className="error-close" onClick={() => window.location.reload()}>
              ×
            </button>
          </div>
        )}

        {/* Features */}
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">👁️</div>
            <h3>Vision AI</h3>
            <p>Advanced image analysis detects components and extracts technical details</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📐</div>
            <h3>AR Overlays</h3>
            <p>Interactive bounding boxes highlight detected components on your diagram</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💬</div>
            <h3>AI Chat</h3>
            <p>Ask questions about your diagram and get instant, context-aware answers</p>
          </div>
        </div>
      </div>
    </main>
  );
}