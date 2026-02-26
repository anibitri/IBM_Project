import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';

export default function DiagramPanel() {
  const { document: doc, selectedComponent, setSelectedComponent, currentImageIndex, setCurrentImageIndex } = useDocumentContext();
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryHeight, setSummaryHeight] = useState(160);
  const [zoom, setZoom] = useState(1);
  const [hoveredId, setHoveredId] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const imageRef = useRef(null);
  const summaryDragging = useRef(false);
  const summaryStartY = useRef(0);
  const summaryStartH = useRef(0);

  // Determine images array (multi-page PDFs) or single image
  const images = doc?.images || [];
  const isPdf = doc?.type === 'pdf' && images.length > 0;
  const totalPages = isPdf ? images.length : 1;

  // Current page's components and image URL
  let components, imageUrl;
  if (isPdf && images.length > 0) {
    const currentPage = images[currentImageIndex] || images[0];
    components = currentPage?.ar_components || [];
    const imgPath = currentPage?.image_path || '';
    imageUrl = imgPath ? `/static/uploads/${imgPath.split('uploads/').pop()}` : null;
  } else {
    components = doc?.ar?.components || [];
    imageUrl = doc?.file?.url || null;
  }

  // Reset zoom on image change
  useEffect(() => {
    setZoom(1);
  }, [imageUrl]);

  useEffect(() => {
    if (imageRef.current) {
      const updateSize = () => {
        if (imageRef.current) {
          setImageSize({
            width: imageRef.current.offsetWidth,
            height: imageRef.current.offsetHeight,
          });
        }
      };

      imageRef.current.addEventListener('load', updateSize);
      window.addEventListener('resize', updateSize);
      updateSize();

      return () => {
        window.removeEventListener('resize', updateSize);
      };
    }
  }, [imageUrl]);

  const handleComponentClick = (comp) => {
    setSelectedComponent((prev) => (prev?.id === comp.id ? null : comp));
  };

  const handlePrevPage = () => {
    setCurrentImageIndex((i) => Math.max(0, i - 1));
    setSelectedComponent(null);
  };

  const handleNextPage = () => {
    setCurrentImageIndex((i) => Math.min(totalPages - 1, i + 1));
    setSelectedComponent(null);
  };

  // Zoom
  const zoomIn = () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)));
  const zoomReset = () => setZoom(1);

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)));
      else setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)));
    }
  }, []);

  // Resizable summary
  const handleSummaryDragStart = useCallback((e) => {
    e.preventDefault();
    summaryDragging.current = true;
    summaryStartY.current = e.clientY;
    summaryStartH.current = summaryHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [summaryHeight]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!summaryDragging.current) return;
      const delta = summaryStartY.current - e.clientY;
      setSummaryHeight(Math.max(60, Math.min(500, summaryStartH.current + delta)));
    };
    const handleUp = () => {
      if (summaryDragging.current) {
        summaryDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  // Clean AI summary
  const cleanSummary = (raw) => {
    if (!raw) return 'No summary available';
    let text = raw;
    const markers = ['Provide a clear, structured analysis:', 'Summary:', 'Analysis:'];
    for (const m of markers) {
      const idx = text.lastIndexOf(m);
      if (idx !== -1) text = text.slice(idx + m.length);
    }
    text = text.replace(/^[\s\n:]+/, '').replace(/[\s\n]+$/, '');
    return text || 'No summary available';
  };

  return (
    <div className="diagram-panel">
      <div className="diagram-main">
        <div className="diagram-container" onWheel={handleWheel}>
          <div
            className="diagram-wrapper"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          >
            {imageUrl ? (
              <>
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Technical Diagram"
                  className="diagram-image"
                />
                {imageSize.width > 0 && (
                  <svg
                    className="diagram-overlay"
                    style={{
                      width: imageSize.width,
                      height: imageSize.height,
                    }}
                  >
                    {components.map((comp) => {
                      const x = comp.x * imageSize.width;
                      const y = comp.y * imageSize.height;
                      const width = comp.width * imageSize.width;
                      const height = comp.height * imageSize.height;
                      const isSelected = selectedComponent?.id === comp.id;
                      const isHovered = hoveredId === comp.id;
                      const labelText = comp.label || comp.id;
                      const labelWidth = Math.min(Math.max(labelText.length * 7 + 12, 40), width + 40);
                      const labelHeight = 18;
                      const labelX = x + (width - labelWidth) / 2;
                      const labelY = y - labelHeight - 3;

                      return (
                        <g
                          key={comp.id}
                          onClick={() => handleComponentClick(comp)}
                          onMouseEnter={() => setHoveredId(comp.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          className="component-overlay"
                        >
                          <rect
                            x={x}
                            y={y}
                            width={width}
                            height={height}
                            fill={isSelected ? 'rgba(99,178,238,0.12)' : isHovered ? 'rgba(74,144,217,0.06)' : 'none'}
                            stroke={isSelected ? '#63b2ee' : isHovered ? '#5ba0e8' : '#4a90d9'}
                            strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.5}
                            rx="3"
                            className="component-box"
                          />
                          {(showLabels || isSelected || isHovered) && labelText && labelText !== 'Unknown' && (
                            <>
                              <rect
                                x={labelX}
                                y={Math.max(0, labelY)}
                                width={labelWidth}
                                height={labelHeight}
                                rx="3"
                                fill={isSelected ? '#63b2ee' : '#4a90d9'}
                                opacity="0.92"
                                className="component-label-bg"
                              />
                              <text
                                x={labelX + labelWidth / 2}
                                y={Math.max(0, labelY) + 13}
                                textAnchor="middle"
                                fill="#fff"
                                fontSize="11"
                                fontWeight="600"
                                fontFamily="Inter, sans-serif"
                                className="component-label-text"
                              >
                                {labelText}
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </>
            ) : (
              <div className="no-image">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <p>No diagram available</p>
              </div>
            )}
          </div>

          {/* Zoom controls */}
          {imageUrl && (
            <div className="zoom-controls">
              <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="zoom-btn" onClick={zoomOut} title="Zoom out">&minus;</button>
              <button className="zoom-btn" onClick={zoomReset} title="Reset zoom" style={{ fontSize: 11 }}>1:1</button>
              <button
                className={`zoom-btn ${showLabels ? 'active' : ''}`}
                onClick={() => setShowLabels(!showLabels)}
                title={showLabels ? 'Hide labels' : 'Show labels'}
                style={{ fontSize: 11, marginTop: 4 }}
              >
                {showLabels ? 'Aa' : 'Aa'}
              </button>
            </div>
          )}
        </div>

        {/* Multi-page navigation */}
        {isPdf && totalPages > 1 && (
          <div className="page-nav">
            <button className="page-nav-btn" onClick={handlePrevPage} disabled={currentImageIndex === 0}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="page-indicator">Page {currentImageIndex + 1} of {totalPages}</span>
            <button className="page-nav-btn" onClick={handleNextPage} disabled={currentImageIndex === totalPages - 1}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}

        {/* Collapsible & resizable summary drawer */}
        <div className={`summary-drawer ${summaryOpen ? 'open' : ''}`}>
          {summaryOpen && (
            <div className="summary-resize-handle" onMouseDown={handleSummaryDragStart}>
              <div className="summary-resize-handle-line" />
            </div>
          )}
          <button
            className="summary-toggle"
            onClick={() => setSummaryOpen(!summaryOpen)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={summaryOpen ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
            </svg>
            <span>AI Analysis Summary</span>
            <span className="summary-badge">
              {components.length} components
            </span>
          </button>
          {summaryOpen && (
            <div className="summary-content" style={{ maxHeight: summaryHeight }}>
              <p>{cleanSummary(doc?.ai_summary)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}