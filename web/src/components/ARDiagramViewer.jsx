import React, { useMemo, Suspense } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei/core/OrbitControls.js';
import { Html } from '@react-three/drei/web/Html.js';
import { Line } from '@react-three/drei/core/Line.js';
import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════
   CONNECTION LINE — 3D line between two component centers
   ═══════════════════════════════════════════════════════════ */

function ConnectionLine({ from, to, components, planeW, planeH, baseY }) {
  const fromComp = components.find((c) => c.id === from);
  const toComp = components.find((c) => c.id === to);
  if (!fromComp || !toComp) return null;

  const fx = (fromComp.x + fromComp.width / 2 - 0.5) * planeW;
  const fy = -(fromComp.y + fromComp.height / 2 - 0.5) * planeH + baseY;
  const tx = (toComp.x + toComp.width / 2 - 0.5) * planeW;
  const ty = -(toComp.y + toComp.height / 2 - 0.5) * planeH + baseY;

  return (
    <Line
      points={[
        [fx, fy, 0.02],
        [tx, ty, 0.02],
      ]}
      color="#2e5a88"
      lineWidth={1.5}
      dashed
      dashSize={0.12}
      gapSize={0.08}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   DIAGRAM MESH — the image rendered as a textured 3D plane
   ═══════════════════════════════════════════════════════════ */

function DiagramMesh({ imageUrl, components, connections, selectedId, onSelect, showLabels }) {
  const texture = useLoader(THREE.TextureLoader, imageUrl);
  const aspect = texture.image ? texture.image.width / texture.image.height : 16 / 9;
  const W = 6;
  const H = W / aspect;

  const borderGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, H)),
    [W, H]
  );

  return (
    <group position={[0, H / 2 + 0.1, 0]}>
      {/* Main diagram image plane */}
      <mesh>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          map={texture}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>

      {/* Subtle border frame */}
      <lineSegments geometry={borderGeo}>
        <lineBasicMaterial color="#4a90d9" transparent opacity={0.35} />
      </lineSegments>

      {/* Component bounding boxes + labels */}
      {components.map((comp) => (
        <ComponentMarker
          key={comp.id}
          comp={comp}
          planeW={W}
          planeH={H}
          selected={selectedId === comp.id}
          onSelect={onSelect}
          showLabels={showLabels}
        />
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMPONENT MARKER — wireframe box + floating label
   ═══════════════════════════════════════════════════════════ */

function ComponentMarker({ comp, planeW, planeH, selected, onSelect, showLabels }) {
  const cx = (comp.x + comp.width / 2 - 0.5) * planeW;
  const cy = -(comp.y + comp.height / 2 - 0.5) * planeH;
  const w = comp.width * planeW;
  const h = comp.height * planeH;

  const wireGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)),
    [w, h]
  );

  const color = selected ? '#FFB74D' : '#63b2ee';
  const labelText = comp.label || comp.id;

  return (
    <group position={[cx, cy, 0.015]}>
      {/* Wireframe bounding box */}
      <lineSegments geometry={wireGeo}>
        <lineBasicMaterial color={color} />
      </lineSegments>

      {/* Semi-transparent fill — clickable */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(comp);
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.18 : 0.06}
        />
      </mesh>

      {/* Floating label — shown when showLabels is on, or if selected */}
      {labelText && labelText !== 'Unknown' && (showLabels || selected) && (
        <Html
          position={[0, h / 2 + 0.14, 0.05]}
          center
          distanceFactor={8}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'auto', userSelect: 'none' }}
        >
          <div
            className={`ar-3d-label ${selected ? 'selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(comp);
            }}
          >
            {labelText}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════
   SCENE — lighting, grid floor, fog (neutral) or transparent (camera)
   ═══════════════════════════════════════════════════════════ */

function Scene({ imageUrl, components, connections, selectedId, onSelect, showLabels }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />
      <directionalLight position={[-3, 5, -2]} intensity={0.25} color="#8ab4f8" />

      {/* Neutral scene background */}
      <color attach="background" args={['#0a1628']} />
      <fog attach="fog" args={['#0a1628', 12, 28]} />

      {/* Floor grid */}
      <gridHelper
        args={[30, 60, '#1e3a5f', '#112240']}
        position={[0, 0, 0]}
      />

      {/* Accent glow ring on floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[3.8, 4, 64]} />
        <meshBasicMaterial color="#4a90d9" transparent opacity={0.12} />
      </mesh>

      {/* Diagram */}
      <DiagramMesh
        imageUrl={imageUrl}
        components={components}
        connections={connections}
        selectedId={selectedId}
        onSelect={onSelect}
        showLabels={showLabels}
      />

      {/* Orbit controls — rotate, zoom, pan around the diagram */}
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.06}
        minDistance={3}
        maxDistance={16}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 2.5, 0]}
      />
    </>
  );
}


/* ═══════════════════════════════════════════════════════════
   LOADING FALLBACK
   ═══════════════════════════════════════════════════════════ */

function LoadingFallback() {
  return (
    <Html center>
      <div className="ar-loader">
        <div className="ar-loader-spinner" />
        <span>Loading 3D scene…</span>
      </div>
    </Html>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN EXPORTED COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function ARDiagramViewer({
  imageUrl,
  components = [],
  connections = [],
  selectedComponent,
  onComponentClick,
  showLabels = true,
}) {
  if (!imageUrl) return null;

  return (
    <div className="ar-viewer-container">
      <Canvas
        camera={{ position: [0, 3.5, 8], fov: 42 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <Scene
            imageUrl={imageUrl}
            components={components}
            connections={connections}
            selectedId={selectedComponent?.id}
            onSelect={onComponentClick}
            showLabels={showLabels}
          />
        </Suspense>
      </Canvas>

      {/* Mode badge */}
      <div className="ar-mode-indicator">🧊 3D Scene</div>
    </div>
  );
}
