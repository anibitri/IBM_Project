import React, { useState, useRef } from 'react';
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
import Svg, { Line, Circle } from 'react-native-svg';
import { FlowParticle, AnimatedArrow } from '../components/FlowAnimation';

// ─── Register AR tracking target ────────────────────────────────────────────
// Guard against null native module (e.g. simulator, missing native link)
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

// ─── AR Scene (receives data via viroAppProps) ───────────────────────────────
//
// IMPORTANT: This must be defined OUTSIDE of ARScreen — never inline in
// initialScene — so React doesn't recreate it on every parent render.
const ARScene = (props) => {
  // viroAppProps is how ViroARSceneNavigator passes data into the scene
  const { onDiagramDetected } = props.sceneNavigator.viroAppProps;

  return (
    <ViroARScene>
      <ViroARImageMarker target="diagram" onAnchorFound={onDiagramDetected}>
        {/*
          All content here uses Viro 3D primitives anchored to the marker.
          Positions are in metres relative to the marker centre.
        */}
        <ViroNode position={[0, 0.05, 0]}>
          {/* Label floating above the diagram */}
          <ViroText
            text="OpenTelemetry Flow"
            scale={[0.1, 0.1, 0.1]}
            position={[0, 0.1, 0]}
            style={{ fontFamily: 'Arial', fontSize: 20, color: '#00D4FF' }}
          />

          {/* Example: highlight the OTel Collector node */}
          <ViroText
            text="OTel Collector"
            scale={[0.06, 0.06, 0.06]}
            position={[-0.05, 0.04, 0]}
            style={{ fontFamily: 'Arial', fontSize: 14, color: '#FFFFFF' }}
            animation={{ name: 'pulse', run: true, loop: true }}
          />

          {/* Example: highlight the Instana Agent node */}
          <ViroText
            text="Instana Agent"
            scale={[0.06, 0.06, 0.06]}
            position={[0.1, 0.04, 0]}
            style={{ fontFamily: 'Arial', fontSize: 14, color: '#7EC8E3' }}
            animation={{ name: 'pulse', run: true, loop: true }}
          />
        </ViroNode>
      </ViroARImageMarker>
    </ViroARScene>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
const ARScreen = () => {
  const [detectedComponents, setDetectedComponents] = useState([]);
  const [detectedConnections, setDetectedConnections] = useState([]);
  const [diagramFound, setDiagramFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onDiagramDetected = async (anchor) => {
    setDiagramFound(true);
    setLoading(true);
    setError(null);
    try {
      // TODO: Replace with real backend call once captureARSnapshot is available
      // const imageData = await captureARSnapshot();
      // const result = await detectComponentsFromBackend(imageData);
      // setDetectedComponents(result.components);
      // setDetectedConnections(result.connections);

      // Temporary mock data so the SVG overlay renders
      setDetectedConnections([
        { start: { x: 10, y: 50 }, end: { x: 90, y: 50 }, path: 'M10,50 L90,50', direction: 'right' },
        { start: { x: 90, y: 50 }, end: { x: 170, y: 50 }, path: 'M90,50 L170,50', direction: 'right' },
      ]);
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
        initialScene={{ scene: ARScene }}         // stable reference, no inline arrow
        viroAppProps={{ onDiagramDetected }}       // pass callbacks via viroAppProps
        style={styles.flex}
      />

      {/*
        ── 2D SVG Overlay Layer ──
        Sits on top of the AR view. react-native-svg works here because
        this is a normal React Native view, not inside Viro's WebGL context.
      */}
      {diagramFound && (
        <Svg
          style={StyleSheet.absoluteFill}
          pointerEvents="none"          // let touches pass through to AR view
        >
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