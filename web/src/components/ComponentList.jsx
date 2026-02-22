import React from 'react';

const ComponentList = ({ components, selectedComponent, onSelectComponent }) => {
  return (
    <div className="component-list">
      <h3>🔍 Detected Components ({components.length})</h3>

      <div className="components-scroll">
        {components.map((comp) => (
          <div
            key={comp.id}
            className={`component-item ${selectedComponent?.id === comp.id ? 'selected' : ''}`}
            onClick={() => onSelectComponent(comp)}
          >
            <div className="component-header">
              <span className="component-label">{comp.label}</span>
              <span className="component-confidence">{(comp.confidence * 100).toFixed(1)}%</span>
            </div>
            {comp.description && (
              <p className="component-description">{comp.description}</p>
            )}
            <div className="component-meta">
              Position: ({(comp.x * 100).toFixed(1)}%, {(comp.y * 100).toFixed(1)}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComponentList;