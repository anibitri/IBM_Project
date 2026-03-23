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
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import AROverlay from '../components/AROverlay';
import CameraARView from '../components/CameraARView';
import { spacing, getPalette } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COMP_COLORS = {
  CPU: '#4682B4', RAM: '#3CA050', Cache: '#B4643C', CLK: '#A03CB4',
  Storage: '#C8A028', GPU: '#B43232', 'I/O': '#50A0A0', Network: '#6450B4',
};

export default function DiagramScreen({ navigation, route }) {
  const { document, clearDocument, accessibilitySettings, uploadAndProcess, loading } = useDocumentContext();
  const [selectedComponent, setSelectedComponent] = useState(null);
  const darkMode = !!accessibilitySettings?.darkMode;
  const p = getPalette(darkMode);

  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [cameraMode, setCameraMode] = useState(route?.params?.cameraMode || false);
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  // Pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const panValueRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);

  const updatePan = (newPan) => {
    panValueRef.current = newPan;
    setPan(newPan);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        zoomRef.current > 1 && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5),
      onPanResponderGrant: () => {
        panRef.current = { ...panValueRef.current };
      },
      onPanResponderMove: (_, gs) => {
        updatePan({ x: panRef.current.x + gs.dx, y: panRef.current.y + gs.dy });
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  useEffect(() => {
    zoomRef.current = zoom;
    if (zoom <= 1) updatePan({ x: 0, y: 0 });
  }, [zoom]);

  useEffect(() => {
    if (!document) navigation.popToTop();
  }, [document, navigation]);

  useEffect(() => {
    if (!document) return;
    const diagramWidth = document.meta?.width || 900;
    const diagramHeight = document.meta?.height || 600;
    if (!document.file?.url && diagramWidth && diagramHeight) {
      setImageDimensions({ width: diagramWidth, height: diagramHeight });
    }
  }, [document]);

  useEffect(() => {
    if (route?.params?.selectedComponent) {
      setSelectedComponent(route.params.selectedComponent);
    }
  }, []);

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

  const handleComponentToggle = (comp) => {
    setSelectedComponent((prev) => (prev?.id === comp?.id ? null : comp));
  };

  const handleNewUpload = () => {
    clearDocument();
    navigation.popToTop();
  };

  const handleCameraCapture = async (photo) => {
    await uploadAndProcess(photo);
  };

  const renderPlaceholder = () => {
    const w = SCREEN_WIDTH - spacing.lg * 2;
    const h = w * (diagramHeight / diagramWidth);
    const bgFill = darkMode ? '#0d1117' : '#F0F0F5';
    const gridStroke = darkMode ? 'rgba(255,255,255,0.06)' : '#DCE1EB';
    const headerFill = darkMode ? '#1a1f2e' : '#323246';

    const boxes = components.map((c) => ({
      x: c.x, y: c.y, w: c.width, h: c.height,
      label: c.label,
      color: c.color || COMP_COLORS[c.label] || '#2997ff',
    }));

    const gridLinesV = [];
    for (let gx = 0; gx < 1; gx += 40 / 800) gridLinesV.push(gx);
    const gridLinesH = [];
    for (let gy = 0; gy < 1; gy += 40 / 600) gridLinesH.push(gy);

    return (
      <Svg width={w} height={h}>
        <Rect width={w} height={h} fill={bgFill} rx={4} />
        {gridLinesV.map((gx, i) => (
          <Line key={`gv-${i}`} x1={gx * w} y1={0} x2={gx * w} y2={h} stroke={gridStroke} strokeWidth={0.5} />
        ))}
        {gridLinesH.map((gy, i) => (
          <Line key={`gh-${i}`} x1={0} y1={gy * h} x2={w} y2={gy * h} stroke={gridStroke} strokeWidth={0.5} />
        ))}
        <Rect x={0} y={0} width={w} height={h * 0.058} fill={headerFill} />
        <SvgText x={w / 2} y={h * 0.038} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="11" fontWeight="bold">
          System Architecture Diagram
        </SvgText>
        {boxes.map((b, i) => (
          <G key={`b-${i}`}>
            <Rect x={b.x * w} y={b.y * h} width={b.w * w} height={b.h * h} fill={b.color} stroke="rgba(0,0,0,0.3)" strokeWidth={1.5} rx={3} />
            <SvgText x={(b.x + b.w / 2) * w} y={(b.y + b.h / 2) * h + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
              {b.label}
            </SvgText>
          </G>
        ))}
      </Svg>
    );
  };

  const confColor = selectedComponent
    ? selectedComponent.confidence >= 0.8
      ? p.success
      : selectedComponent.confidence >= 0.5
      ? '#ffd60a'
      : p.error
    : p.primary;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Diagram canvas */}
        <View style={[styles.canvasWrap, { backgroundColor: darkMode ? '#08090e' : '#f0f0f5' }, cameraMode && { backgroundColor: '#000', padding: 0 }]}>
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
              onScan={handleCameraCapture}
            />
          ) : (
            <View
              {...panResponder.panHandlers}
              style={{ transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] }}
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

          {/* Processing overlay */}
          {loading && cameraMode && (
            <View style={styles.processingOverlay}>
              <View style={[styles.processingCard, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
                <ActivityIndicator size="large" color={p.primary} />
                <Text style={[styles.processingTitle, { color: p.text }]}>Analysing diagram…</Text>
                <Text style={[styles.processingHint, { color: p.subtext }]}>Running vision analysis</Text>
              </View>
            </View>
          )}
        </View>

        {/* Toolbar row */}
        <View style={styles.toolbarRow}>
          {/* Zoom controls (diagram mode only) */}
          {!cameraMode && (
            <View style={[styles.zoomGroup, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
              <TouchableOpacity
                style={styles.zoomBtn}
                onPress={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="add" size={18} color={p.text} />
              </TouchableOpacity>
              <Text style={[styles.zoomLabel, { color: p.subtext }]}>{Math.round(zoom * 100)}%</Text>
              <TouchableOpacity
                style={styles.zoomBtn}
                onPress={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="remove" size={18} color={p.text} />
              </TouchableOpacity>
              <View style={[styles.zoomDivider, { backgroundColor: p.border }]} />
              <TouchableOpacity
                style={styles.zoomBtn}
                onPress={() => { setZoom(1); updatePan({ x: 0, y: 0 }); }}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="contract-outline" size={16} color={p.text} />
              </TouchableOpacity>
              <View style={[styles.zoomDivider, { backgroundColor: p.border }]} />
              <TouchableOpacity
                style={[styles.zoomBtn, showLabels && { backgroundColor: p.primaryGlass }]}
                onPress={() => setShowLabels((v) => !v)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={[styles.aaLabel, { color: showLabels ? p.primary : p.muted }]}>Aa</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Camera / Diagram toggle */}
          <TouchableOpacity
            style={[
              styles.modeToggle,
              { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop },
              cameraMode && { backgroundColor: p.primary, borderColor: p.primary, borderTopColor: p.primary },
            ]}
            onPress={() => { setCameraMode((v) => !v); setCameraFullscreen(false); }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={cameraMode ? 'image-outline' : 'camera-outline'}
              size={18}
              color={cameraMode ? '#fff' : p.primary}
            />
            <Text style={[styles.modeToggleText, { color: cameraMode ? '#fff' : p.text }]}>
              {cameraMode ? 'Diagram' : 'AR Camera'}
            </Text>
          </TouchableOpacity>

          {/* Fullscreen (camera mode only) */}
          {cameraMode && (
            <TouchableOpacity
              style={[styles.fullscreenBtn, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}
              onPress={() => setCameraFullscreen(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="expand-outline" size={18} color={p.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Selected component detail card */}
        {selectedComponent && (
          <View style={[styles.selectedCard, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
            <View style={styles.selectedHeader}>
              <View style={[styles.selectedBadge, { backgroundColor: p.primaryGlass }]}>
                <Ionicons name="hardware-chip-outline" size={16} color={p.primary} />
              </View>
              <Text style={[styles.selectedLabel, { color: p.text }]} numberOfLines={1}>
                {selectedComponent.label}
              </Text>
              <View style={[styles.selectedConfBadge, { backgroundColor: confColor + '1A' }]}>
                <Text style={[styles.selectedConfText, { color: confColor }]}>
                  {(selectedComponent.confidence * 100).toFixed(1)}%
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.selectedClose, { backgroundColor: p.cardSoftAbs }]}
                onPress={() => setSelectedComponent(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={14} color={p.muted} />
              </TouchableOpacity>
            </View>
            {selectedComponent.description ? (
              <Text style={[styles.selectedDesc, { color: p.subtext }]} numberOfLines={3}>
                {selectedComponent.description}
              </Text>
            ) : null}
          </View>
        )}

        {/* AI Summary card */}
        <View style={[styles.infoCard, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
          <View style={styles.infoCardHeader}>
            <View style={[styles.infoIcon, { backgroundColor: p.primaryGlass }]}>
              <Ionicons name="sparkles-outline" size={16} color={p.primary} />
            </View>
            <Text style={[styles.infoCardTitle, { color: p.text }]}>AI Summary</Text>
          </View>
          <Text style={[styles.infoCardBody, { color: p.subtext }]}>
            {document.ai_summary || 'No summary available for this diagram.'}
          </Text>
        </View>

        {/* Stats row */}
        <View style={[styles.statsCard, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: p.primary }]}>{components.length}</Text>
            <Text style={[styles.statLabel, { color: p.muted }]}>Components</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: p.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: p.primary }]}>
              {document.ar?.relationships?.connections?.length || 0}
            </Text>
            <Text style={[styles.statLabel, { color: p.muted }]}>Connections</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: p.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: p.primary }]} numberOfLines={1} adjustsFontSizeToFit>
              {document.meta?.width || 0}×{document.meta?.height || 0}
            </Text>
            <Text style={[styles.statLabel, { color: p.muted }]}>Resolution</Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { backgroundColor: p.cardAbs, borderTopColor: p.border }]}>
        <TouchableOpacity
          style={[styles.bottomBtn, { borderColor: p.border, borderTopColor: p.borderTop }]}
          onPress={() => navigation.navigate('Components')}
          activeOpacity={0.8}
        >
          <Ionicons name="list-outline" size={20} color={p.primary} />
          <Text style={[styles.bottomBtnText, { color: p.text }]}>Components</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.bottomBtnPrimary, { backgroundColor: p.primary }]}
          onPress={handleNewUpload}
          activeOpacity={0.85}
        >
          <Ionicons name="add-outline" size={20} color="#fff" />
          <Text style={[styles.bottomBtnText, { color: '#fff' }]}>New Upload</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  /* Canvas */
  canvasWrap: {
    margin: spacing.lg,
    marginBottom: 0,
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_WIDTH - spacing.lg * 2,
    height: (SCREEN_WIDTH - spacing.lg * 2) * 0.75,
  },

  /* Processing overlay */
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  processingCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    minWidth: 200,
  },
  processingTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  processingHint: { fontSize: 13 },

  /* Toolbar */
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    gap: 8,
  },
  zoomGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  zoomBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 38,
    textAlign: 'center',
  },
  zoomDivider: { width: 1, height: 20, marginHorizontal: 2 },
  aaLabel: { fontSize: 13, fontWeight: '700' },

  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  modeToggleText: { fontSize: 14, fontWeight: '600' },

  fullscreenBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },

  /* Selected component card */
  selectedCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  selectedBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectedLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  selectedConfBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    flexShrink: 0,
  },
  selectedConfText: { fontSize: 12, fontWeight: '700' },
  selectedClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectedDesc: { fontSize: 13, lineHeight: 19 },

  /* AI Summary card */
  infoCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCardTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  infoCardBody: { fontSize: 14, lineHeight: 21 },

  /* Stats card */
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  statDivider: { width: 1, marginVertical: spacing.sm },
  statValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, marginBottom: 3 },
  statLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },

  /* Bottom bar */
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  bottomBtnPrimary: {
    borderWidth: 0,
    shadowColor: '#2997ff',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  bottomBtnText: { fontSize: 15, fontWeight: '600' },
});
