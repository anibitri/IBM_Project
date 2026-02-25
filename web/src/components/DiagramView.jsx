import React from 'react';

export default function DiagramView({ document, selectedComponent, onComponentSelect }) {
  const components = document.ar?.components || [];
  const imageUrl = document.file?.url || '';

  return (
    <div className="diagram-view">
      {/* Diagram with AR Overlays */}
      <div className="diagram-container">
        <div className="diagram-wrapper">
          <img
            src={imageUrl}
            alt="Diagram"
            className="diagram-image"
          />
          <svg className="diagram-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
            {components.map((comp) => {
              const isSelected = selectedComponent?.id === comp.id;
              return (
                <g key={comp.id} onClick={() => onComponentSelect(comp)} className="overlay-component">
                  <rect
                    x={comp.x * 100}
                    y={comp.y * 100}
                    width={comp.width * 100}
                    height={comp.height * 100}
                    fill="none"
                    stroke={isSelected ? '#00ff00' : '#0080ff'}
                    strokeWidth={isSelected ? '0.5' : '0.3'}
                    className="component-box"
                  />
                  <circle
                    cx={comp.center_x * 100}
                    cy={comp.center_y * 100}
                    r="0.5"
                    fill={isSelected ? '#00ff00' : '#0080ff'}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* AI Summary */}
      <div className="summary-section">
        <h3 className="summary-title">🤖 AI Analysis</h3>
        <p className="summary-text">{document.ai_summary || 'No summary available'}</p>
      </div>

      {/* Component Stats */}
      <div className="stats-section">
        <div className="stat-card">
          <div className="stat-value">{components.length}</div>
          <div className="stat-label">Components Detected</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {document.ar?.relationships?.connections?.length || 0}
          </div>
          <div className="stat-label">Connections</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {components.length > 0
              ? ((components.reduce((sum, c) => sum + c.confidence, 0) / components.length) * 100).toFixed(0)
              : 0}%
          </div>
          <div className="stat-label">Avg Confidence</div>
        </div>
      </div>

      {/* Components List */}
      <div className="components-section">
        <h3 className="components-title">🔍 Detected Components</h3>
        <div className="components-list">
          {components.map((comp, idx) => (
            <div
              key={comp.id}
              className={`component-item ${selectedComponent?.id === comp.id ? 'selected' : ''}`}
              onClick={() => onComponentSelect(comp)}
            >
              <div className="component-header">
                <span className="component-index">#{idx + 1}</span>
                <span className="component-label">{comp.label}</span>
                <span className="component-confidence">
                  {(comp.confidence * 100).toFixed(0)}%
                </span>
              </div>
              {comp.description && (
                <p className="component-description">{comp.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}