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
  Platform,
} from 'react-native';
// Replaced @expo/vector-icons
import Ionicons from 'react-native-vector-icons/Ionicons';
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

export default function DiagramScreen({ navigation, route }) {
  const { document, clearDocument, accessibilitySettings } = useDocumentContext();
  const [selectedComponent, setSelectedComponent] = useState(null);
  const darkMode = !!accessibilitySettings?.darkMode;
  const palette = darkMode
    ? {
        bg: '#121417',
        card: '#1b1f24',
        border: '#303741',
        text: '#f4f7fb',
        subtext: '#9aa3ad',
        primary: '#4ea3ff',
      }
    : {
        bg: colors.background,
        card: colors.white,
        border: colors.border,
        text: colors.text,
        subtext: colors.textLight,
        primary: colors.primary,
      };

  // Toggle component selection
  const handleComponentToggle = (comp) => {
    setSelectedComponent((prev) => (prev?.id === comp?.id ? null : comp));
  };
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [cameraMode, setCameraMode] = useState(route?.params?.cameraMode || false);
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  // Pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });       // snapshot at gesture start
  const panValueRef = useRef({ x: 0, y: 0 });  // always tracks current pan
  const zoomRef = useRef(1);                     // always tracks current zoom

  const updatePan = (newPan) => {
    panValueRef.current = newPan;
    setPan(newPan);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        return zoomRef.current > 1 && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5);
      },
      onPanResponderGrant: () => {
        panRef.current = { ...panValueRef.current };
      },
      onPanResponderMove: (_, gs) => {
        updatePan({
          x: panRef.current.x + gs.dx,
          y: panRef.current.y + gs.dy,
        });
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  useEffect(() => {
    zoomRef.current = zoom;
    if (zoom <= 1) {
      updatePan({ x: 0, y: 0 });
    }
  }, [zoom]);

  useEffect(() => {
    if (!document) {
      navigation.popToTop();
    }
  }, [document, navigation]);

  useEffect(() => {
    if (!document) return;

    const diagramWidth = document.meta?.width || 900;
    const diagramHeight = document.meta?.height || 600;

    if (!document.file?.url && diagramWidth && diagramHeight) {
      setImageDimensions({ width: diagramWidth, height: diagramHeight });
    }
  }, [document]);

  if (!document) return null;

  const components = document.ar?.components || [];
  const connections = document.ar?.relationships?.connections || [];
  const imageUrl = document.file?.url || '';
  const diagramWidth = document.meta?.width || 900;
  const diagramHeight = document.meta?.height || 600;

  const handleImageLoad = (event) => {
    const { width, height } = event.nativeEvent.source;
    setImageDimensions({ width, height });
  };

  // Set initial selected component if navigated from ComponentScreen
  useEffect(() => {
    if (route?.params?.selectedComponent) {
      setSelectedComponent(route.params.selectedComponent);
    }
  }, []);

  const handleNewUpload = () => {
    clearDocument();
    navigation.popToTop();
  };

  const renderPlaceholder = () => {
    const w = SCREEN_WIDTH - spacing.md * 2;
    const h = w * (diagramHeight / diagramWidth);

    const boxes = components.map((c) => ({
      x: c.x, y: c.y, w: c.width, h: c.height,
      label: c.label,
      color: c.color || COMP_COLORS[c.label] || '#4a90d9',
    }));

    const gridLinesV = [];
    for (let gx = 0; gx < 1; gx += 40 / 800) gridLinesV.push(gx);
    const gridLinesH = [];
    for (let gy = 0; gy < 1; gy += 40 / 600) gridLinesH.push(gy);

    return (
      <Svg width={w} height={h}>
        <Rect width={w} height={h} fill="#F0F0F5" rx={4} />
        {gridLinesV.map((gx, i) => (
          <Line key={`gv-${i}`} x1={gx * w} y1={0} x2={gx * w} y2={h} stroke="#DCE1EB" strokeWidth={0.5} />
        ))}
        {gridLinesH.map((gy, i) => (
          <Line key={`gh-${i}`} x1={0} y1={gy * h} x2={w} y2={gy * h} stroke="#DCE1EB" strokeWidth={0.5} />
        ))}
        <Rect x={0} y={0} width={w} height={h * 0.058} fill="#323246" />
        <SvgText x={w / 2} y={h * 0.038} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
          System Architecture Diagram
        </SvgText>
        {boxes.map((b, i) => (
          <G key={`b-${i}`}>
            <Rect x={b.x * w} y={b.y * h} width={b.w * w} height={b.h * h} fill={b.color} stroke="#1E1E1E" strokeWidth={2} rx={2} />
            <SvgText x={(b.x + b.w / 2) * w} y={(b.y + b.h / 2) * h + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
              {b.label}
            </SvgText>
          </G>
        ))}
      </Svg>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}> 
      <ScrollView style={styles.scrollView}>
        <View style={[styles.imageContainer, { backgroundColor: darkMode ? '#0f1114' : colors.white }, cameraMode && styles.imageContainerCamera]}>
          {cameraMode ? (
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
          ) : (
            <View
              {...panResponder.panHandlers}
              style={{ transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] }}
            >
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" onLoad={handleImageLoad} />
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

        {!cameraMode && (
          <View style={styles.zoomControls}>
            <TouchableOpacity style={[styles.zoomBtn, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>
              <Text style={[styles.zoomBtnText, { color: palette.text }]}>+</Text>
            </TouchableOpacity>
            <Text style={[styles.zoomLabel, { color: palette.subtext }]}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity style={[styles.zoomBtn, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}>
              <Text style={[styles.zoomBtnText, { color: palette.text }]}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.zoomBtn, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={() => { setZoom(1); updatePan({ x: 0, y: 0 }); }}>
              <Text style={[styles.zoomBtnText, { fontSize: 12, color: palette.text }]}>1:1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.zoomBtn, { backgroundColor: palette.card, borderColor: palette.border }, showLabels && { backgroundColor: palette.primary, borderColor: palette.primary }]} onPress={() => setShowLabels((v) => !v)}>
              <Text style={[styles.zoomBtnText, { fontSize: 12 }, showLabels && { color: colors.white }]}>Aa</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.cameraRow}>
          <TouchableOpacity style={[styles.cameraToggle, { backgroundColor: palette.card, borderColor: palette.border }, cameraMode && { backgroundColor: palette.primary, borderColor: palette.primary }]} onPress={() => { setCameraMode((v) => !v); setCameraFullscreen(false); }}>
            <Ionicons name={cameraMode ? 'image-outline' : 'camera-outline'} size={16} color={cameraMode ? colors.white : palette.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.cameraToggleText, { color: cameraMode ? colors.white : palette.text }]}>
              {cameraMode ? 'Diagram View' : 'Camera AR'}
            </Text>
          </TouchableOpacity>
          {cameraMode && (
            <TouchableOpacity style={styles.fullscreenBtn} onPress={() => setCameraFullscreen(true)}>
              <Text style={styles.fullscreenBtnText}>⊞ Fullscreen</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.summaryContainer, { backgroundColor: palette.card, borderColor: palette.border }]}> 
          <Text style={[styles.summaryTitle, { color: palette.text }]}>AI Summary</Text>
          <Text style={[styles.summaryText, { color: palette.subtext }]}>{document.ai_summary || 'No summary available'}</Text>
        </View>

        <View style={[styles.statsContainer, { backgroundColor: palette.card, borderColor: palette.border }]}> 
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: palette.primary }]}>{components.length}</Text>
            <Text style={[styles.statLabel, { color: palette.subtext }]}>Components</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: palette.primary }]}>{document.ar?.relationships?.connections?.length || 0}</Text>
            <Text style={[styles.statLabel, { color: palette.subtext }]}>Connections</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: palette.primary }]}>{document.meta?.width || 0} × {document.meta?.height || 0}</Text>
            <Text style={[styles.statLabel, { color: palette.subtext }]}>Resolution</Text>
          </View>
        </View>

        {selectedComponent && (
          <View style={styles.selectedComponentContainer}>
            <View style={styles.selectedCompHeader}>
              <Text style={styles.selectedComponentTitle}>{selectedComponent.label}</Text>
              <TouchableOpacity onPress={() => setSelectedComponent(null)} style={styles.selectedCloseBtn}>
                <Text style={styles.selectedCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.selectedCompScroll} nestedScrollEnabled>
              {selectedComponent.description && <Text style={styles.selectedComponentDesc}>{selectedComponent.description}</Text>}
              <Text style={styles.selectedComponentMeta}>Confidence: {(selectedComponent.confidence * 100).toFixed(1)}%</Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomNav, { backgroundColor: palette.card, borderTopColor: palette.border }]}> 
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('Components')}>
          <Ionicons name="list-outline" size={22} color={palette.primary} />
          <Text style={[styles.navButtonText, { color: palette.text }]}>Components</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={handleNewUpload}>
          <Ionicons name="add-circle-outline" size={22} color={palette.primary} />
          <Text style={[styles.navButtonText, { color: palette.text }]}>New</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ... styles remain unchanged (refer to previous version)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  imageContainer: { backgroundColor: colors.white, padding: spacing.md, position: 'relative', overflow: 'hidden' },
  imageContainerCamera: { backgroundColor: '#000', padding: spacing.md },
  image: { width: SCREEN_WIDTH - spacing.md * 2, height: (SCREEN_WIDTH - spacing.md * 2) * 0.75 },
  summaryContainer: { backgroundColor: colors.white, margin: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.sm },
  summaryText: { ...typography.body, color: colors.textLight, lineHeight: 22 },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.white, margin: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  statBox: { alignItems: 'center' },
  statValue: { ...typography.h2, color: colors.primary, marginBottom: spacing.xs },
  statLabel: { ...typography.caption, color: colors.textLight },
  selectedComponentContainer: { backgroundColor: colors.primary, margin: spacing.md, padding: spacing.md, borderRadius: 12, maxHeight: 200 },
  selectedCompHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  selectedComponentTitle: { fontSize: 18, color: colors.white, fontWeight: '700', flex: 1 },
  selectedCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  selectedCloseBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  selectedCompScroll: { maxHeight: 130 },
  selectedComponentDesc: { ...typography.body, color: colors.white, opacity: 0.9, marginBottom: spacing.sm },
  selectedComponentMeta: { ...typography.caption, color: colors.white, opacity: 0.8 },
  bottomNav: { flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, paddingBottom: Platform.OS === 'ios' ? 28 : spacing.sm, paddingHorizontal: spacing.md },
  navButton: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  navButtonText: { ...typography.caption, color: colors.text, fontWeight: '600' },
  cameraRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginTop: spacing.sm, gap: 8 },
  cameraToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: spacing.md, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  cameraToggleText: { fontSize: 15, fontWeight: '600', color: colors.text },
  fullscreenBtn: { padding: spacing.md, borderRadius: 12, backgroundColor: '#0a1628', borderWidth: 1, borderColor: '#4a90d9' },
  fullscreenBtnText: { color: '#4a90d9', fontSize: 14, fontWeight: '700' },
  zoomControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.md, marginTop: spacing.sm, gap: 8 },
  zoomBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  zoomBtnText: { fontSize: 18, fontWeight: '700', color: colors.text },
  zoomLabel: { fontSize: 13, fontWeight: '600', color: colors.textLight, minWidth: 40, textAlign: 'center' },
});