import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import AROverlay from '../components/AROverlay';
import CameraARView from '../components/CameraARView';
import { colors, spacing, typography } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Component colours matching the conftest.py test diagram
const COMP_COLORS = {
  CPU: '#4682B4', RAM: '#3CA050', Cache: '#B4643C', CLK: '#A03CB4',
  Storage: '#C8A028', GPU: '#B43232', 'I/O': '#50A0A0', Network: '#6450B4',
};

export default function DiagramScreen({ navigation }) {
  const { document, clearDocument } = useDocumentContext();
  const [selectedComponent, setSelectedComponent] = useState(null);

  // Toggle component selection — click to show, click again to hide
  const handleComponentToggle = (comp) => {
    setSelectedComponent((prev) => (prev?.id === comp?.id ? null : comp));
  };
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [cameraMode, setCameraMode] = useState(false);
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  // Pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        // Only capture gestures when zoomed in and the user is clearly dragging
        return zoom > 1 && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5);
      },
      onPanResponderGrant: () => {
        panRef.current = { ...pan };
      },
      onPanResponderMove: (_, gs) => {
        setPan({
          x: panRef.current.x + gs.dx,
          y: panRef.current.y + gs.dy,
        });
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  // Reset pan when zoom resets
  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  useEffect(() => {
    if (!document) {
      navigation.replace('HomeMain');
    }
  }, [document, navigation]);

  if (!document) {
    return null;
  }

  const components = document.ar?.components || [];
  const connections = document.ar?.relationships?.connections || [];
  const imageUrl = document.file?.url || '';
  const diagramWidth = document.meta?.width || 900;
  const diagramHeight = document.meta?.height || 600;

  // Set mock image dimensions when no real image
  useEffect(() => {
    if (!imageUrl && diagramWidth && diagramHeight) {
      setImageDimensions({ width: diagramWidth, height: diagramHeight });
    }
  }, [imageUrl, diagramWidth, diagramHeight]);

  const handleImageLoad = (event) => {
    const { width, height } = event.nativeEvent.source;
    setImageDimensions({ width, height });
  };

  const handleNewUpload = () => {
    clearDocument();
    navigation.replace('HomeMain');
  };

  // SVG placeholder matching the conftest.py test diagram
  const renderPlaceholder = () => {
    const w = SCREEN_WIDTH - spacing.md * 2;
    const h = w * (diagramHeight / diagramWidth);

    // Component boxes with real colors
    const boxes = components.map((c) => ({
      x: c.x, y: c.y, w: c.width, h: c.height,
      label: c.label,
      color: c.color || COMP_COLORS[c.label] || '#4a90d9',
    }));

    // Grid lines (matching conftest.py 40px grid on 800×600)
    const gridLinesV = [];
    for (let gx = 0; gx < 1; gx += 40 / 800) gridLinesV.push(gx);
    const gridLinesH = [];
    for (let gy = 0; gy < 1; gy += 40 / 600) gridLinesH.push(gy);

    return (
      <Svg width={w} height={h}>
        {/* Background */}
        <Rect width={w} height={h} fill="#F0F0F5" rx={4} />

        {/* Grid pattern */}
        {gridLinesV.map((gx, i) => (
          <Line key={`gv-${i}`} x1={gx * w} y1={0} x2={gx * w} y2={h}
            stroke="#DCE1EB" strokeWidth={0.5} />
        ))}
        {gridLinesH.map((gy, i) => (
          <Line key={`gh-${i}`} x1={0} y1={gy * h} x2={w} y2={gy * h}
            stroke="#DCE1EB" strokeWidth={0.5} />
        ))}

        {/* Title bar */}
        <Rect x={0} y={0} width={w} height={h * 0.058} fill="#323246" />
        <SvgText x={w / 2} y={h * 0.038} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
          System Architecture Diagram
        </SvgText>

        {/* Connection lines */}
        {connections.map((conn, i) => {
          const fromComp = components.find(c => c.id === conn.from);
          const toComp = components.find(c => c.id === conn.to);
          if (!fromComp || !toComp) return null;
          return (
            <Line
              key={`conn-${i}`}
              x1={fromComp.center_x * w} y1={fromComp.center_y * h}
              x2={toComp.center_x * w}   y2={toComp.center_y * h}
              stroke="#505064" strokeWidth={1.5}
            />
          );
        })}

        {/* Component rectangles */}
        {boxes.map((b, i) => (
          <G key={`b-${i}`}>
            <Rect
              x={b.x * w} y={b.y * h}
              width={b.w * w} height={b.h * h}
              fill={b.color} stroke="#1E1E1E" strokeWidth={2} rx={2}
            />
            <SvgText
              x={(b.x + b.w / 2) * w} y={(b.y + b.h / 2) * h + 4}
              textAnchor="middle" fill="white" fontSize="11" fontWeight="bold"
            >
              {b.label}
            </SvgText>
          </G>
        ))}
      </Svg>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Image with AR Overlay */}
        <View style={[styles.imageContainer, cameraMode && styles.imageContainerCamera]}>
          {cameraMode ? (
            <>
              <CameraARView
                components={components}
                connections={connections}
                selectedComponent={selectedComponent}
                onComponentPress={handleComponentToggle}
                imageDimensions={imageDimensions}
                showLabels={showLabels}
                fullscreen={cameraFullscreen}
                onToggleFullscreen={() => setCameraFullscreen((v) => !v)}
              />
            </>
          ) : (
            <View
              {...panResponder.panHandlers}
              style={{
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { scale: zoom },
                ],
              }}
            >
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.image}
                  resizeMode="contain"
                  onLoad={handleImageLoad}
                />
              ) : (
                renderPlaceholder()
              )}
              <AROverlay
                components={components}
                connections={connections}
                imageDimensions={imageDimensions}
                selectedComponent={selectedComponent}
                onComponentPress={handleComponentToggle}
                showLabels={showLabels}
              />
            </View>
          )}
        </View>

        {/* Zoom & label controls */}
        {!cameraMode && (
          <View style={styles.zoomControls}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            >
              <Text style={styles.zoomBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
            >
              <Text style={styles.zoomBtnText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            >
              <Text style={[styles.zoomBtnText, { fontSize: 12 }]}>1:1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.zoomBtn, showLabels && styles.zoomBtnActive]}
              onPress={() => setShowLabels((v) => !v)}
            >
              <Text style={[styles.zoomBtnText, { fontSize: 12 }, showLabels && { color: colors.white }]}>Aa</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Camera toggle */}
        <View style={styles.cameraRow}>
          <TouchableOpacity
            style={[styles.cameraToggle, cameraMode && styles.cameraToggleActive]}
            onPress={() => { setCameraMode((v) => !v); setCameraFullscreen(false); }}
          >
            <Text style={[styles.cameraToggleText, cameraMode && { color: colors.white }]}>
              <Ionicons name={cameraMode ? 'image-outline' : 'camera-outline'} size={16} color={cameraMode ? colors.white : colors.primary} />{' '}
              {cameraMode ? 'Diagram View' : 'Camera AR'}
            </Text>
          </TouchableOpacity>

          {cameraMode && (
            <TouchableOpacity
              style={[styles.fullscreenBtn]}
              onPress={() => setCameraFullscreen(true)}
            >
              <Text style={styles.fullscreenBtnText}>⊞ Fullscreen</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* AI Summary */}
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryTitle}>AI Summary</Text>
          <Text style={styles.summaryText}>
            {document.ai_summary || 'No summary available'}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{components.length}</Text>
            <Text style={styles.statLabel}>Components</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {document.ar?.relationships?.connections?.length || 0}
            </Text>
            <Text style={styles.statLabel}>Connections</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {document.meta?.width || 0} × {document.meta?.height || 0}
            </Text>
            <Text style={styles.statLabel}>Resolution</Text>
          </View>
        </View>

        {/* Selected Component Info */}
        {selectedComponent && (
          <View style={styles.selectedComponentContainer}>
            <View style={styles.selectedCompHeader}>
              <Text style={styles.selectedComponentTitle}>
                {selectedComponent.label}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedComponent(null)}
                style={styles.selectedCloseBtn}
              >
                <Text style={styles.selectedCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.selectedCompScroll} nestedScrollEnabled>
              {selectedComponent.description && (
                <Text style={styles.selectedComponentDesc}>
                  {selectedComponent.description}
                </Text>
              )}
              <Text style={styles.selectedComponentMeta}>
                Confidence: {(selectedComponent.confidence * 100).toFixed(1)}%
              </Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Components')}
        >
          <Ionicons name="list-outline" size={22} color={colors.primary} />
          <Text style={styles.navButtonText}>Components</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton} onPress={handleNewUpload}>
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text style={styles.navButtonText}>New</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    backgroundColor: colors.white,
    padding: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  imageContainerCamera: {
    backgroundColor: '#000',
    padding: spacing.md,
  },
  image: {
    width: SCREEN_WIDTH - spacing.md * 2,
    height: (SCREEN_WIDTH - spacing.md * 2) * 0.75,
  },
  summaryContainer: {
    backgroundColor: colors.white,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  summaryText: {
    ...typography.body,
    color: colors.textLight,
    lineHeight: 22,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textLight,
  },
  selectedComponentContainer: {
    backgroundColor: colors.primary,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    maxHeight: 200,
  },
  selectedCompHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  selectedComponentTitle: {
    fontSize: 18,
    color: colors.white,
    fontWeight: '700',
    flex: 1,
  },
  selectedCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCloseBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  selectedCompScroll: {
    maxHeight: 130,
  },
  selectedComponentLabel: {
    ...typography.h2,
    color: colors.white,
    marginBottom: spacing.xs,
  },
  selectedComponentDesc: {
    ...typography.body,
    color: colors.white,
    opacity: 0.9,
    marginBottom: spacing.sm,
  },
  selectedComponentMeta: {
    ...typography.caption,
    color: colors.white,
    opacity: 0.8,
  },
  deselectButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    padding: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  deselectButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  navButtonIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  navButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  cameraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: 8,
  },
  cameraToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cameraToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  fullscreenBtn: {
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: '#0a1628',
    borderWidth: 1,
    borderColor: '#4a90d9',
  },
  fullscreenBtnText: {
    color: '#4a90d9',
    fontSize: 14,
    fontWeight: '700',
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: 8,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  zoomBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  zoomLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textLight,
    minWidth: 40,
    textAlign: 'center',
  },
});