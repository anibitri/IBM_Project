import { useState, useEffect, useRef } from 'react';
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
  Modal,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Svg, { Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { useMobileDocumentContext as useDocumentContext } from '../context/MobileDocumentContext';
import AROverlay from '../components/AROverlay';
import CameraARView from '../components/CameraARView';
import DiagramAskSheet from '../components/DiagramAskSheet';
import { spacing, getPalette } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_HEIGHT = Dimensions.get('window').height;

const COMP_COLORS = {
  CPU: '#4682B4', RAM: '#3CA050', Cache: '#B4643C', CLK: '#A03CB4',
  Storage: '#C8A028', GPU: '#B43232', 'I/O': '#50A0A0', Network: '#6450B4',
};

export default function DiagramScreen({ navigation, route }) {
  const { document, clearDocument, accessibilitySettings, uploadAndProcess, loading, currentImageIndex, setCurrentImageIndex } = useDocumentContext();
  const [selectedComponent, setSelectedComponent] = useState(null);
  const darkMode = !!accessibilitySettings?.darkMode;
  const p = getPalette(darkMode);

  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const isCameraEntry = route?.params?.cameraMode || false;
  const [cameraMode, setCameraMode] = useState(isCameraEntry);
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [switcherHeight, setSwitcherHeight] = useState(44);
  const [diagramFullscreen, setDiagramFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [askSheetVisible, setAskSheetVisible] = useState(false);
  // 'document' = clean scrollable view of all pages, no AR
  // 'diagram'  = per-page AR annotated view
  // Start in diagram mode when opened via AR Camera button
  const [viewMode, setViewMode] = useState(isCameraEntry ? 'diagram' : 'document');

  // Pan & zoom state (normal view)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const panValueRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);

  // Fullscreen zoom/pan state (Reanimated)
  const [fsZoomDisplay, setFsZoomDisplay] = useState(100);
  const fsScale = useSharedValue(1);
  const fsPanX = useSharedValue(0);
  const fsPanY = useSharedValue(0);
  const fsBaseScale = useSharedValue(1);
  const fsBasePanX = useSharedValue(0);
  const fsBasePanY = useSharedValue(0);

  const resetFsZoom = () => {
    fsScale.value = withTiming(1, { duration: 250 });
    fsPanX.value = withTiming(0, { duration: 250 });
    fsPanY.value = withTiming(0, { duration: 250 });
    fsBaseScale.value = 1;
    fsBasePanX.value = 0;
    fsBasePanY.value = 0;
    setFsZoomDisplay(100);
  };

  const fsPinch = Gesture.Pinch()
    .onUpdate((e) => {
      fsScale.value = Math.max(0.5, Math.min(5, fsBaseScale.value * e.scale));
    })
    .onEnd(() => {
      fsBaseScale.value = fsScale.value;
      runOnJS(setFsZoomDisplay)(Math.round(fsScale.value * 100));
    });

  const fsPan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      fsPanX.value = fsBasePanX.value + e.translationX;
      fsPanY.value = fsBasePanY.value + e.translationY;
    })
    .onEnd(() => {
      fsBasePanX.value = fsPanX.value;
      fsBasePanY.value = fsPanY.value;
    });

  const fsGesture = Gesture.Simultaneous(fsPinch, fsPan);

  const fsAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: fsPanX.value },
      { translateY: fsPanY.value },
      { scale: fsScale.value },
    ],
  }));

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
    if (diagramFullscreen) {
      fsScale.value = 1;
      fsPanX.value = 0;
      fsPanY.value = 0;
      fsBaseScale.value = 1;
      fsBasePanX.value = 0;
      fsBasePanY.value = 0;
      setFsZoomDisplay(100);
    }
  }, [diagramFullscreen]);

  useEffect(() => {
    // Only navigate away when not loading, not in camera mode, and no document
    if (!document && !cameraMode && !loading) {
      navigation.popToTop();
    }
  }, [document, cameraMode, loading]);

  useEffect(() => {
    if (!document) return;
    const diagramWidth = document.meta?.width || 900;
    const diagramHeight = document.meta?.height || 600;
    setImageDimensions({ width: diagramWidth, height: diagramHeight });
  }, [document]);

  useEffect(() => {
    if (route?.params?.selectedComponent) {
      setSelectedComponent(route.params.selectedComponent);
    }
  }, [route?.params?.selectedComponent]);

  if (!document && !cameraMode && !loading) return null;

  const pages = document?.images || [];

  // In diagram mode, never use -1 as the effective index — fall back to page 0.
  const effectiveIndex = (viewMode === 'diagram' && currentImageIndex === -1 && pages.length > 0)
    ? 0
    : currentImageIndex;

  const currentPage = effectiveIndex >= 0 && pages[effectiveIndex] ? pages[effectiveIndex] : null;
  const components = currentPage?.ar_components || document?.ar?.components || [];
  const connections = currentPage?.ar_relationships?.connections || document?.ar?.relationships?.connections || [];
  // For a document with no pages array (legacy), fall back to the original file URL.
  const imageUrl = currentPage?.url || (pages.length === 0 ? document?.file?.url : '') || '';
  const diagramWidth = currentPage?.image_size?.[0] || document?.meta?.width || 900;
  const diagramHeight = currentPage?.image_size?.[1] || document?.meta?.height || 600;
  const pageAiSummary = currentPage?.vision_summary || document?.ai_summary || 'No summary available for this diagram.';

  const handleImageLoad = (event) => {
    const { width, height } = event.nativeEvent.source;
    setImageDimensions({ width, height });
  };

  const handleComponentToggle = (comp) => {
    setSelectedComponent((prev) => (prev?.id === comp?.id ? null : comp));
  };

  const handleNewUpload = () => {
    // Clear the document — the useEffect will navigate to HomeMain when document is null
    clearDocument();
  };

  const handleCameraCapture = async (photo) => {
    await uploadAndProcess(photo);
  };

  // Switch to diagram mode for a specific page index.
  const handleViewDiagram = (pageIdx) => {
    setCurrentImageIndex(pageIdx);
    setViewMode('diagram');
    setSelectedComponent(null);
    setZoom(1);
    updatePan({ x: 0, y: 0 });
  };

  const renderPlaceholder = (overrideW, overrideH) => {
    const w = overrideW || (SCREEN_WIDTH - spacing.lg * 2);
    const h = overrideH || (w * (diagramHeight / diagramWidth));
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

  // ── Fullscreen diagram modal ────────────────────────────────────────────────
  // Compute the actual rendered size of the image (respect aspect ratio within screen bounds)
  const fsAspect = imageDimensions.width > 0 ? imageDimensions.height / imageDimensions.width : 0.75;
  const fsImgW = SCREEN_HEIGHT > SCREEN_WIDTH * fsAspect ? SCREEN_WIDTH : SCREEN_HEIGHT / fsAspect;
  const fsImgH = fsImgW * fsAspect;

  const diagramFullscreenContent = diagramFullscreen ? (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={() => { setDiagramFullscreen(false); resetFsZoom(); }}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        {/* Top bar: close | zoom % | reset */}
        <View style={fsStyles.topBar}>
          <TouchableOpacity
            style={fsStyles.topBtn}
            onPress={() => { setDiagramFullscreen(false); resetFsZoom(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="contract-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={fsStyles.zoomBadge}>
            <Text style={fsStyles.zoomBadgeText}>{fsZoomDisplay}%</Text>
          </View>
          <TouchableOpacity
            style={fsStyles.topBtn}
            onPress={resetFsZoom}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="scan-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Gesture-driven image area */}
        <GestureDetector gesture={fsGesture}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            <Animated.View style={[{ width: fsImgW, height: fsImgH }, fsAnimStyle]}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: fsImgW, height: fsImgH }}
                  resizeMode="stretch"
                />
              ) : (
                renderPlaceholder(fsImgW, fsImgH)
              )}
              <AROverlay
                components={components}
                connections={connections}
                containerWidth={fsImgW}
                imageDimensions={imageDimensions}
                selectedComponent={selectedComponent}
                onComponentPress={handleComponentToggle}
                showLabels={showLabels}
              />
            </Animated.View>
          </View>
        </GestureDetector>

        {/* Bottom controls */}
        <View style={fsStyles.bottomBar}>
          <TouchableOpacity
            style={fsStyles.ctrlBtn}
            onPress={() => {
              const next = Math.max(0.5, fsScale.value - 0.5);
              fsScale.value = withTiming(next, { duration: 200 });
              fsBaseScale.value = next;
              setFsZoomDisplay(Math.round(next * 100));
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="remove-circle-outline" size={26} color="#fff" />
            <Text style={fsStyles.ctrlLabel}>Zoom Out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={fsStyles.ctrlBtn}
            onPress={() => {
              const next = Math.min(5, fsScale.value + 0.5);
              fsScale.value = withTiming(next, { duration: 200 });
              fsBaseScale.value = next;
              setFsZoomDisplay(Math.round(next * 100));
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="add-circle-outline" size={26} color="#fff" />
            <Text style={fsStyles.ctrlLabel}>Zoom In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={fsStyles.ctrlBtn}
            onPress={() => setShowLabels((v) => !v)}
            activeOpacity={0.75}
          >
            <Text style={[fsStyles.aaText, { color: showLabels ? p.primary : '#888' }]}>Aa</Text>
            <Text style={[fsStyles.ctrlLabel, { color: showLabels ? p.primary : '#888' }]}>Labels</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={fsStyles.ctrlBtn}
            onPress={() => setAskSheetVisible(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="sparkles-outline" size={26} color={p.primary} />
            <Text style={[fsStyles.ctrlLabel, { color: p.primary }]}>Ask AI</Text>
          </TouchableOpacity>
        </View>

        {/* DiagramAskSheet rendered inside fullscreen so it stacks on top */}
        <DiagramAskSheet
          visible={askSheetVisible}
          onClose={() => {
            setAskSheetVisible(false);
            setDiagramFullscreen(false);
            resetFsZoom();
          }}
          selectedComponent={selectedComponent}
          navigation={navigation}
        />
      </View>
    </Modal>
  ) : null;

  // ── Document view: all pages, no AR overlay ─────────────────────────────────
  const renderDocumentView = () => {
    // Support both multi-page (images array) and single-file documents.
    const docPages = pages.length > 0
      ? pages
      : document?.file?.url
        ? [{ url: document.file.url, page: 1 }]
        : [];

    if (docPages.length === 0) {
      return (
        <View style={styles.emptyDoc}>
          <Ionicons name="document-outline" size={48} color={p.muted} />
          <Text style={[styles.emptyDocText, { color: p.subtext }]}>No document pages available</Text>
        </View>
      );
    }

    return docPages.map((pg, idx) => {
      const pageNum = pg.page || idx + 1;
      const hasAR = (pg.ar_components?.length ?? 0) > 0;
      return (
        <View key={idx} style={[styles.docPageWrap, { borderColor: p.border, backgroundColor: p.cardAbs }]}>
          <View style={[styles.docPageHeader, { borderBottomColor: p.border }]}>
            <View style={[styles.docPageBadge, { backgroundColor: p.primaryGlass }]}>
              <Text style={[styles.docPageBadgeText, { color: p.primary }]}>Page {pageNum}</Text>
            </View>
            {hasAR && (
              <TouchableOpacity
                style={[styles.docDiagramBtn, { backgroundColor: p.primaryGlass, borderColor: p.primary + '44' }]}
                onPress={() => handleViewDiagram(idx)}
                activeOpacity={0.75}
              >
                <Ionicons name="layers-outline" size={13} color={p.primary} />
                <Text style={[styles.docDiagramBtnText, { color: p.primary }]}>View Diagram</Text>
              </TouchableOpacity>
            )}
          </View>
          {pg.url ? (
            <Image
              source={{ uri: pg.url }}
              style={styles.docPageImage}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.docPagePlaceholder, { backgroundColor: darkMode ? '#0d1117' : '#f0f0f5' }]}>
              <Ionicons name="image-outline" size={36} color={p.muted} />
            </View>
          )}
          {pg.vision_summary ? (
            <View style={[styles.docPageSummary, { borderTopColor: p.border }]}>
              <Text style={[styles.docPageSummaryText, { color: p.subtext }]} numberOfLines={3}>
                {pg.vision_summary}
              </Text>
            </View>
          ) : null}
        </View>
      );
    });
  };

  // ── Diagram view: current page with AR overlay ──────────────────────────────
  const renderDiagramCanvas = () => (
    <>
      {/* Page tabs — only shown when there are multiple pages */}
      {pages.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.pageTabs, { backgroundColor: p.bg }]}
          contentContainerStyle={styles.pageTabsContent}
        >
          {pages.map((pg, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.pageTab,
                { backgroundColor: p.cardAbs, borderColor: effectiveIndex === idx ? p.primary : p.border },
              ]}
              onPress={() => setCurrentImageIndex(idx)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pageTabText, { color: effectiveIndex === idx ? p.primary : p.subtext }]}>
                Pg {pg.page || idx + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Diagram canvas */}
      <View style={[styles.canvasWrap, { backgroundColor: darkMode ? '#08090e' : '#f0f0f5' }, cameraMode && { backgroundColor: '#000', padding: 0, margin: 0, borderRadius: 0, minHeight: 300 }]}>
        {!cameraMode && (
          <View
            {...panResponder.panHandlers}
            style={{ transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] }}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{
                  width: SCREEN_WIDTH - spacing.lg * 2,
                  height: imageDimensions.width > 0
                    ? (SCREEN_WIDTH - spacing.lg * 2) * (imageDimensions.height / imageDimensions.width)
                    : (SCREEN_WIDTH - spacing.lg * 2) * 0.75,
                }}
                resizeMode="contain"
                onLoad={handleImageLoad}
              />
            ) : (
              renderPlaceholder()
            )}
            <AROverlay
              components={components}
              connections={connections}
              containerWidth={SCREEN_WIDTH - spacing.lg * 2}
              imageDimensions={imageDimensions}
              selectedComponent={selectedComponent}
              onComponentPress={handleComponentToggle}
              showLabels={showLabels}
            />
          </View>
        )}
      </View>

      {/* Toolbar row */}
      <View style={styles.toolbarRow}>
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

        <TouchableOpacity
          style={[styles.fullscreenBtn, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}
          onPress={() => cameraMode ? setCameraFullscreen(true) : setDiagramFullscreen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="expand-outline" size={18} color={p.primary} />
        </TouchableOpacity>
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
          <TouchableOpacity
            style={[styles.selectedAskBtn, { backgroundColor: p.primaryGlass, borderColor: p.primary + '44' }]}
            onPress={() => setAskSheetVisible(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="sparkles-outline" size={13} color={p.primary} />
            <Text style={[styles.selectedAskBtnText, { color: p.primary }]}>
              Ask AI about this component
            </Text>
          </TouchableOpacity>
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
          {pageAiSummary}
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
          <Text style={[styles.statValue, { color: p.primary }]}>{connections.length}</Text>
          <Text style={[styles.statLabel, { color: p.muted }]}>Connections</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: p.border }]} />
        {pages.length > 1 ? (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: p.primary }]}>
              {`${effectiveIndex + 1}/${pages.length}`}
            </Text>
            <Text style={[styles.statLabel, { color: p.muted }]}>Page</Text>
          </View>
        ) : (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: p.primary }]} numberOfLines={1} adjustsFontSizeToFit>
              {document?.meta?.width || 0}×{document?.meta?.height || 0}
            </Text>
            <Text style={[styles.statLabel, { color: p.muted }]}>Resolution</Text>
          </View>
        )}
      </View>
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]}>
      {diagramFullscreenContent}

      {/* View mode switcher — always visible at the top */}
      <View
        onLayout={(e) => setSwitcherHeight(e.nativeEvent.layout.height)}
        style={[styles.viewModeSwitcher, { backgroundColor: p.cardAbs, borderBottomColor: p.border }]}
      >
        <TouchableOpacity
          style={[
            styles.viewModeTab,
            viewMode === 'document' && [styles.viewModeTabActive, { borderBottomColor: p.primary }],
          ]}
          onPress={() => setViewMode('document')}
          activeOpacity={0.75}
        >
          <Ionicons name="document-text-outline" size={16} color={viewMode === 'document' ? p.primary : p.muted} />
          <Text style={[styles.viewModeTabText, { color: viewMode === 'document' ? p.primary : p.muted }]}>
            Document
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewModeTab,
            viewMode === 'diagram' && [styles.viewModeTabActive, { borderBottomColor: p.primary }],
          ]}
          onPress={() => {
            // Ensure a valid page is selected when entering diagram mode.
            if (currentImageIndex === -1 && pages.length > 0) setCurrentImageIndex(0);
            setViewMode('diagram');
          }}
          activeOpacity={0.75}
        >
          <Ionicons name="layers-outline" size={16} color={viewMode === 'diagram' ? p.primary : p.muted} />
          <Text style={[styles.viewModeTabText, { color: viewMode === 'diagram' ? p.primary : p.muted }]}>
            {`Diagrams${pages.length > 1 ? ` (${pages.length})` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {viewMode === 'document' ? (
          <View style={styles.docContainer}>
            {renderDocumentView()}
          </View>
        ) : (
          renderDiagramCanvas()
        )}
      </ScrollView>

      {/* Camera overlay — lives outside the ScrollView so the Camera component
          never remounts during fullscreen transitions; only the container style changes */}
      {cameraMode && viewMode === 'diagram' && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { top: cameraFullscreen ? 0 : switcherHeight },
          ]}
          pointerEvents="box-none"
        >
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
            onAskAI={() => setAskSheetVisible(true)}
          />
          {loading && (
            <View style={styles.processingOverlay}>
              <View style={[styles.processingCard, { backgroundColor: p.cardAbs, borderColor: p.border, borderTopColor: p.borderTop }]}>
                <ActivityIndicator size="large" color={p.primary} />
                <Text style={[styles.processingTitle, { color: p.text }]}>Analysing diagram…</Text>
                <Text style={[styles.processingHint, { color: p.subtext }]}>Running vision analysis</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { backgroundColor: p.cardAbs, borderTopColor: p.border }]}>
        <TouchableOpacity
          style={[styles.bottomBtn, { borderColor: p.border }]}
          onPress={() => navigation.navigate('Components')}
          activeOpacity={0.8}
        >
          <Ionicons name="list-outline" size={18} color={p.primary} />
          <Text style={[styles.bottomBtnText, { color: p.text }]}>Components</Text>
        </TouchableOpacity>
        {/* Ask AI — hidden in camera mode; camera has its own in-controls Ask AI button */}
        {!cameraMode && (
          <TouchableOpacity
            style={[styles.bottomBtn, styles.bottomBtnAsk, { backgroundColor: p.primaryGlass, borderColor: p.primary + '55', borderTopColor: p.primary + '55' }]}
            onPress={() => setAskSheetVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles-outline" size={18} color={p.primary} />
            <Text style={[styles.bottomBtnText, { color: p.primary }]}>Ask AI</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.bottomBtn, styles.bottomBtnPrimary, { backgroundColor: p.primary }]}
          onPress={handleNewUpload}
          activeOpacity={0.85}
        >
          <Ionicons name="add-outline" size={18} color="#fff" />
          <Text style={[styles.bottomBtnText, { color: '#fff' }]}>New</Text>
        </TouchableOpacity>
      </View>

      <DiagramAskSheet
        visible={askSheetVisible}
        onClose={() => setAskSheetVisible(false)}
        selectedComponent={selectedComponent}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  /* View mode switcher */
  viewModeSwitcher: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  viewModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  viewModeTabActive: {
    borderBottomWidth: 2,
  },
  viewModeTabText: {
    fontSize: 14,
    fontWeight: '600',
  },

  /* Document view */
  docContainer: {
    padding: spacing.lg,
    gap: 16,
  },
  docPageWrap: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  docPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  docPageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  docPageBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  docDiagramBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    borderWidth: 1,
  },
  docDiagramBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  docPageImage: {
    width: '100%',
    aspectRatio: 0.77, // approximate portrait page ratio
    backgroundColor: '#f5f5f5',
  },
  docPagePlaceholder: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docPageSummary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  docPageSummaryText: {
    fontSize: 12,
    lineHeight: 18,
  },
  emptyDoc: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyDocText: {
    fontSize: 14,
  },

  /* Page tabs (diagram mode) */
  pageTabs: { marginHorizontal: spacing.lg, marginBottom: 6 },
  pageTabsContent: { paddingVertical: 4, gap: 6, flexDirection: 'row' },
  pageTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  pageTabText: { fontSize: 12, fontWeight: '600' },

  /* Canvas (diagram mode) */
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
  selectedDesc: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  selectedAskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectedAskBtnText: { fontSize: 13, fontWeight: '600' },

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
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 14 : 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  bottomBtnAsk: { borderWidth: 1 },
  bottomBtnPrimary: {
    borderWidth: 0,
    shadowColor: '#2997ff',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  bottomBtnText: { fontSize: 13, fontWeight: '600' },
});

const fsStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  zoomBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  ctrlBtn: {
    alignItems: 'center',
    gap: 5,
    minWidth: 64,
  },
  ctrlLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  aaText: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
});
