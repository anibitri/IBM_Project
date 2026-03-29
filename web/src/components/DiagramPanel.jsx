import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { useDocumentContext } from '@ar-viewer/shared/context/DocumentContext';
import { cleanSummary } from '@ar-viewer/shared';
import { renderMarkdown } from './markdownUtils';

const ARDiagramViewer = lazy(() => import('./ARDiagramViewer'));
import { useDiagramControls } from '../hooks/useDiagramControls';
import { useSummaryDrawer } from '../hooks/useSummaryDrawer';

export default function DiagramPanel() {
  const {
    document: doc,
    selectedComponent,
    setSelectedComponent,
    currentImageIndex,
    setCurrentImageIndex,
  } = useDocumentContext();

  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState(null);
  const imageRef = useRef(null);

  // Determine images array (multi-page PDFs) or single image
  const images = doc?.images || [];
  const isPdf = doc?.type === 'pdf' && images.length > 0;
  const totalPages = isPdf ? images.length : 1;

  let components, connections, imageUrl;
  if (isPdf && images.length > 0) {
    const currentPage = images[currentImageIndex] || images[0];
    components = currentPage?.ar_components || [];
    connections =
      currentPage?.ar_relationships?.connections ||
      currentPage?.relationships?.connections ||
      [];
    const imgPath = currentPage?.image_path || '';
    imageUrl = imgPath ? `/static/uploads/${imgPath.split('uploads/').pop()}` : null;
  } else {
    components = doc?.ar?.components || [];
    connections = doc?.ar?.relationships?.connections || [];
    imageUrl = doc?.file?.url || null;
  }

  // ── Custom hooks ──────────────────────────────────────────────────────────
  const {
    zoom, pan, viewMode, showLabels,
    setViewMode, setShowLabels,
    zoomIn, zoomOut, zoomReset,
    handleWheel, handlePanMouseDown,
    wasClick,
  } = useDiagramControls(imageUrl);

  const { summaryOpen, setSummaryOpen, summaryHeight, handleResizeStart } =
    useSummaryDrawer(160);

  // Track rendered image dimensions for SVG overlay sizing
  useEffect(() => {
    if (!imageRef.current) return;
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
  }, [imageUrl]);

  const handleComponentClick = (comp) => {
    if (!wasClick()) return;
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

  return (
    <div className="diagram-panel">
      <div className="diagram-main">
        <div
          className={`diagram-container${viewMode === '3d' ? ' ar-active' : ''}`}
          onWheel={viewMode === '2d' ? handleWheel : undefined}
        >
          {viewMode === '2d' ? (
            <div
              className="diagram-wrapper"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                cursor: zoom > 1 ? 'grab' : 'default',
              }}
              onMouseDown={handlePanMouseDown}
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
                      style={{ width: imageSize.width, height: imageSize.height }}
                    >
                      {components.map((comp) => {
                        const x = comp.x * imageSize.width;
                        const y = comp.y * imageSize.height;
                        const width = comp.width * imageSize.width;
                        const height = comp.height * imageSize.height;
                        const isSelected = selectedComponent?.id === comp.id;
                        const isHovered = hoveredId === comp.id;
                        const labelText = comp.label || comp.id;
                        const labelWidth = Math.min(
                          Math.max(labelText.length * 7 + 12, 40),
                          width + 40
                        );
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
                              fill={
                                isSelected
                                  ? 'rgba(41,151,255,0.14)'
                                  : isHovered
                                  ? 'rgba(41,151,255,0.07)'
                                  : 'none'
                              }
                              stroke={
                                isSelected
                                  ? '#2997ff'
                                  : isHovered
                                  ? '#409cff'
                                  : 'rgba(41,151,255,0.75)'
                              }
                              strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.5}
                              rx="3"
                              className="component-box"
                            />
                            {(showLabels || isSelected || isHovered) &&
                              labelText &&
                              labelText !== 'Unknown' && (
                                <>
                                  <rect
                                    x={labelX}
                                    y={Math.max(0, labelY)}
                                    width={labelWidth}
                                    height={labelHeight}
                                    rx="3"
                                    fill={isSelected ? '#2997ff' : 'rgba(41,151,255,0.85)'}
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
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <p>No diagram available</p>
                </div>
              )}
            </div>
          ) : (
            imageUrl && (
              <Suspense fallback={<div className="loading-placeholder">Loading 3D viewer…</div>}>
                <ARDiagramViewer
                  imageUrl={imageUrl}
                  components={components}
                  connections={connections}
                  selectedComponent={selectedComponent}
                  onComponentClick={handleComponentClick}
                  showLabels={showLabels}
                />
              </Suspense>
            )
          )}

          {/* View controls */}
          {imageUrl && (
            <div className="zoom-controls">
              {viewMode === '2d' && (
                <>
                  <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
                  <span className="zoom-label">{Math.round(zoom * 100)}%</span>
                  <button className="zoom-btn" onClick={zoomOut} title="Zoom out">&minus;</button>
                  <button
                    className="zoom-btn"
                    onClick={zoomReset}
                    title="Reset zoom"
                    style={{ fontSize: 11 }}
                  >
                    1:1
                  </button>
                </>
              )}
              <button
                className={`zoom-btn ${showLabels ? 'active' : ''}`}
                onClick={() => setShowLabels(!showLabels)}
                title={showLabels ? 'Hide labels' : 'Show labels'}
                style={{ fontSize: 11, marginTop: 4 }}
              >
                Aa
              </button>
              <button
                className={`zoom-btn ${viewMode === '3d' ? 'active' : ''}`}
                onClick={() => setViewMode((v) => (v === '2d' ? '3d' : '2d'))}
                title={viewMode === '2d' ? 'Switch to 3D AR view' : 'Switch to 2D flat view'}
                style={{ fontSize: 11, marginTop: 4, fontWeight: 700 }}
              >
                {viewMode === '2d' ? 'AR' : '2D'}
              </button>
            </div>
          )}
        </div>

        {/* Multi-page navigation */}
        {isPdf && totalPages > 1 && (
          <div className="page-nav">
            <button
              className="page-nav-btn"
              onClick={handlePrevPage}
              disabled={currentImageIndex === 0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="page-indicator">
              Page {currentImageIndex + 1} of {totalPages}
            </span>
            <button
              className="page-nav-btn"
              onClick={handleNextPage}
              disabled={currentImageIndex === totalPages - 1}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}

        {/* Collapsible & resizable AI summary drawer */}
        <div className={`summary-drawer ${summaryOpen ? 'open' : ''}`}>
          {summaryOpen && (
            <div className="summary-resize-handle" onMouseDown={handleResizeStart}>
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
            <span className="summary-badge">{components.length} components</span>
          </button>
          {summaryOpen && (
            <div className="summary-content" style={{ maxHeight: summaryHeight }}>
              <div className="summary-text">
                {renderMarkdown(cleanSummary(doc?.ai_summary))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
