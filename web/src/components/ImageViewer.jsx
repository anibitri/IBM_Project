import React, { useState, useRef, useEffect } from 'react';

const ImageViewer = ({ imageUrl, components, selectedComponent, onComponentClick }) => {
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);

  useEffect(() => {
    if (imageRef.current) {
      const { naturalWidth, naturalHeight } = imageRef.current;
      setImageDimensions({ width: naturalWidth, height: naturalHeight });
    }
  }, [imageUrl]);

  const handleImageLoad = (e) => {
    setImageDimensions({
      width: e.target.naturalWidth,
      height: e.target.naturalHeight,
    });
  };

  return (
    <div className="image-viewer">
      <div className="image-container">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Diagram"
          onLoad={handleImageLoad}
          className="diagram-image"
        />

        <svg className="ar-overlay" viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}>
          {components.map((comp) => {
            const x = comp.x * imageDimensions.width;
            const y = comp.y * imageDimensions.height;
            const width = comp.width * imageDimensions.width;
            const height = comp.height * imageDimensions.height;
            const isSelected = selectedComponent?.id === comp.id;

            return (
              <g key={comp.id} onClick={() => onComponentClick(comp)}>
                {/* Bounding box */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="none"
                  stroke={isSelected ? '#00ff00' : '#0080ff'}
                  strokeWidth={isSelected ? 4 : 2}
                  className="ar-box"
                />

                {/* Label background */}
                <rect
                  x={x}
                  y={y - 24}
                  width={comp.label.length * 8 + 10}
                  height={20}
                  fill={isSelected ? '#00ff00' : '#0080ff'}
                  opacity="0.9"
                />

                {/* Label text */}
                <text
                  x={x + 5}
                  y={y - 10}
                  fill="white"
                  fontSize="14"
                  fontWeight="bold"
                >
                  {comp.label}
                </text>

                {/* Center point */}
                <circle
                  cx={comp.center_x * imageDimensions.width}
                  cy={comp.center_y * imageDimensions.height}
                  r="4"
                  fill={isSelected ? '#00ff00' : '#0080ff'}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default ImageViewer;