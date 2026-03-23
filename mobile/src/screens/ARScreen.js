import React, { useState } from 'react';
import {
  ViroARSceneNavigator,
  ViroARScene,
  ViroARImageMarker,
  ViroARTrackingTargets,
  ViroText,
  ViroNode,
  ViroAnimations,
} from '@reactvision/react-viro';
import { View, Text, StyleSheet } from 'react-native';
import Svg from 'react-native-svg';
import { FlowParticle, AnimatedArrow } from '../components/FlowAnimation';
import { useMobileDocumentContext } from '../context/MobileDocumentContext';

// ─── Register AR tracking target ────────────────────────────────────────────
if (ViroARTrackingTargets) {
  ViroARTrackingTargets.createTargets({
    diagram: {
      source: require('../assets/diagram-marker.png'),
      orientation: 'Up',
      physicalWidth: 0.2,
    },
  });
}

// ─── Register Viro animations ───────────────────────────────────────────────
if (ViroAnimations) {
  ViroAnimations.registerAnimations({
    pulse: {
      properties: { scaleX: 1.05, scaleY: 1.05, scaleZ: 1.05 },
      duration: 800,
      easing: 'EaseInEaseOut',
    },
  });
}

// Convert a normalized 2D component position to a 3D Viro position.
// The marker is 0.2 m wide; x/y normalized coords map to the marker plane.
// Viro axes: x = right, y = up, z = towards viewer.
// We map diagram x → Viro x, diagram y → Viro -z (depth), and float y = 0.04 m above.
const toViroPosition = (cx, cy) => {
  const MARKER_SIZE = 0.2;
  const x = (cx - 0.5) * MARKER_SIZE;
  const z = (cy - 0.5) * MARKER_SIZE;
  return [x, 0.04, z];
};

// ─── AR Scene (receives data via viroAppProps) ───────────────────────────────
//
// IMPORTANT: defined OUTSIDE ARScreen so React never recreates it on re-render.
const ARScene = (props) => {
  const { onDiagramDetected, components } = props.sceneNavigator.viroAppProps;

  return (
    <ViroARScene>
      <ViroARImageMarker target="diagram" onAnchorFound={onDiagramDetected}>
        <ViroNode position={[0, 0.05, 0]}>
          {components.length > 0 ? (
            components.map((comp, idx) => {
              const cx = comp.center_x ?? comp.x ?? 0.5;
              const cy = comp.center_y ?? comp.y ?? 0.5;
              const label = comp.label || comp.type || `Component ${idx + 1}`;
              const isFirst = idx === 0;
              return (
                <ViroText
                  key={comp.id || idx}
                  text={label}
                  scale={isFirst ? [0.1, 0.1, 0.1] : [0.06, 0.06, 0.06]}
                  position={isFirst ? [0, 0.1, 0] : toViroPosition(cx, cy)}
                  style={{
                    fontFamily: 'Arial',
                    fontSize: isFirst ? 20 : 14,
                    color: isFirst ? '#00D4FF' : '#FFFFFF',
                  }}
                  animation={isFirst ? undefined : { name: 'pulse', run: true, loop: true }}
                />
              );
            })
          ) : (
            // Fallback when no document components are available yet
            <ViroText
              text="Scan a diagram to detect components"
              scale={[0.08, 0.08, 0.08]}
              position={[0, 0.1, 0]}
              style={{ fontFamily: 'Arial', fontSize: 16, color: '#00D4FF' }}
            />
          )}
        </ViroNode>
      </ViroARImageMarker>
    </ViroARScene>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
const ARScreen = () => {
  const { document } = useMobileDocumentContext();
  const [detectedConnections, setDetectedConnections] = useState([]);
  const [diagramFound, setDiagramFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Pull components from processed document; fall back to empty array
  const components = document?.ar?.components || [];

  const onDiagramDetected = async (anchor) => {
    setDiagramFound(true);
    setLoading(true);
    setError(null);
    try {
      // Wire up connection overlays from the document
      const rawConns = document?.ar?.connections || document?.ar?.relationships?.connections || [];
      if (rawConns.length > 0) {
        setDetectedConnections(
          rawConns.map((c) => ({
            start: c.start || { x: 0, y: 0 },
            end: c.end || { x: 100, y: 100 },
            path: c.path || `M${c.start?.x || 0},${c.start?.y || 0} L${c.end?.x || 100},${c.end?.y || 100}`,
            direction: c.direction || 'right',
          }))
        );
      } else {
        // Fallback animated arrows so the SVG overlay is not empty
        setDetectedConnections([
          { start: { x: 10, y: 50 }, end: { x: 90, y: 50 }, path: 'M10,50 L90,50', direction: 'right' },
        ]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.flex}>
      {/* ── AR Camera Layer ── */}
      <ViroARSceneNavigator
        autofocus
        initialScene={{ scene: ARScene }}
        viroAppProps={{ onDiagramDetected, components }}
        style={styles.flex}
      />

      {/* ── 2D SVG Connection Overlay ── */}
      {diagramFound && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {detectedConnections.map((conn, idx) => (
            <FlowParticle
              key={`particle-${idx}`}
              from={conn.start}
              to={conn.end}
              speed={2000}
              color="cyan"
            />
          ))}
          {detectedConnections.map((conn, idx) => (
            <AnimatedArrow
              key={`arrow-${idx}`}
              path={conn.path}
              direction={conn.direction}
            />
          ))}
        </Svg>
      )}

      {/* ── Loading Overlay ── */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Detecting diagram...</Text>
        </View>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── Hint when no diagram detected yet ── */}
      {!diagramFound && !loading && (
        <View style={styles.hintBanner} pointerEvents="none">
          <Text style={styles.hintText}>Point your camera at the diagram</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: { color: '#fff', fontSize: 18 },
  errorBanner: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  errorText: { color: '#FF4D4D', fontSize: 16 },
  hintBanner: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: '#fff',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
});

export default ARScreen;
