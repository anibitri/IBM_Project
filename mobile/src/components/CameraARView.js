/**
 * CameraARView — Cinematic augmented-reality overlay on live camera.
 *
 * Designed to feel like smart-glasses scanning a scene: holographic panels
 * that float beside detected components, data-stream connection curves,
 * depth-aware parallax motion, and a military-HUD aesthetic.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  useWindowDimensions,
  TouchableOpacity,
  Animated,
  StatusBar,

  Platform,
  ScrollView,
  AppState,
} from 'react-native';

// Bare React Native Replacements
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import Ionicons from 'react-native-vector-icons/Ionicons';

import Svg, {
  Line as SvgLine,
  Circle,
  Text as SvgText,
} from 'react-native-svg';

const PARALLAX_FACTOR = 28;
const SENSOR_INTERVAL = 50;
const SMOOTHING = 0.18;
const CORNER = 12;

export default function CameraARView({
  components,
  selectedComponent,
  onComponentPress,
  imageDimensions,
  showLabels: showLabelsProp = true,
  fullscreen: fullscreenProp = false,
  onToggleFullscreen,
  onScan,
  onAskAI,
}) {
  // Vision Camera hooks
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef(null);

  const [showLabels, setShowLabels] = useState(showLabelsProp);
  const [internalSelected, setInternalSelected] = useState(null);
  const [scanStatus, setScanStatus] = useState('idle'); // 'idle' | 'capturing' | 'processing' | 'done' | 'error'
  const [scanError, setScanError] = useState(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppIsActive(state === 'active'));
    return () => sub.remove();
  }, []);

  /* ── Device-motion parallax ── */
  const offsetX = useRef(new Animated.Value(0)).current;
  const offsetY = useRef(new Animated.Value(0)).current;
  const smoothX = useRef(0);
  const smoothY = useRef(0);

  useEffect(() => {
    // Set update interval for react-native-sensors
    setUpdateIntervalForType(SensorTypes.accelerometer, SENSOR_INTERVAL);
    
    // Subscribe to sensor stream
    const subscription = accelerometer.subscribe(({ x, y }) => {
      smoothX.current += (x - smoothX.current) * SMOOTHING;
      smoothY.current += (y - smoothY.current) * SMOOTHING;
      offsetX.setValue(smoothX.current * PARALLAX_FACTOR);
      offsetY.setValue(-smoothY.current * PARALLAX_FACTOR);
    });
    
    return () => subscription.unsubscribe();
  }, []);

  /* ── Component lock-on pulse ── */
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  /* ── HUD telemetry flicker ── */
  const hudFlicker = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(hudFlicker, {
          toValue: 0.55,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(hudFlicker, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.delay(4500),
      ]),
    ).start();
  }, []);

  /* ── Fade-in for component appearance ── */
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();
  }, []);

  /* ── Grid breathing ── */
  const gridOpacity = useRef(new Animated.Value(0.08)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(gridOpacity, {
          toValue: 0.18,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(gridOpacity, {
          toValue: 0.06,
          duration: 3000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  /* ── Selection logic ── */
  const selected = selectedComponent ?? internalSelected;
  const handleSelect = (comp) => {
    const nextVal = selected?.id === comp.id ? null : comp;
    if (onComponentPress) onComponentPress(nextVal);
    setInternalSelected(nextVal);
  };
  const handleDismiss = () => {
    if (onComponentPress) onComponentPress(null);
    setInternalSelected(null);
  };

  /* ── Capture & send to backend ── */
  const captureAndScan = async () => {
    if (!cameraRef.current || scanStatus !== 'idle') return;
    setScanError(null);
    setScanStatus('capturing');
    try {
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: 'speed' });
      setScanStatus('processing');
      if (onScan) {
        await onScan({
          uri: `file://${photo.path}`,
          type: 'image/jpeg',
          name: 'scan.jpg',
          captureSource: 'live-camera',
          clientWidth: photo.width,
          clientHeight: photo.height,
          orientation: photo.orientation,
        });
      }
      setScanStatus('done');
      setTimeout(() => setScanStatus('idle'), 2000);
    } catch (err) {
      setScanError(err.message || 'Capture failed');
      setScanStatus('error');
      setTimeout(() => setScanStatus('idle'), 3000);
    }
  };

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  const isFullscreen = fullscreenProp;

  // useWindowDimensions updates automatically on rotation — never stale.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Measure the actual rendered container so we know the exact pixel area the
  // camera preview is filling. This is the ground truth for component scaling.
  // Start as null so overlays are withheld until onLayout gives us real dimensions —
  // the initial guess would be wrong (wrong height, doesn't account for insets /
  // fullscreen state) and causes overlays to land in the wrong positions on first render.
  const [containerSize, setContainerSize] = useState(null);
  const containerWidth  = containerSize?.width  ?? windowWidth;
  const containerHeight = containerSize?.height ?? windowWidth * 0.75;

  const rawPhotoW = imageDimensions?.width  > 0 ? imageDimensions.width  : containerWidth;
  const rawPhotoH = imageDimensions?.height > 0 ? imageDimensions.height : containerHeight;
  const safePhotoW = Math.max(1, rawPhotoW);
  const safePhotoH = Math.max(1, rawPhotoH);
  const containScale = Math.min(containerWidth / safePhotoW, containerHeight / safePhotoH);
  const renderWidth = safePhotoW * containScale;
  const renderHeight = safePhotoH * containScale;
  const overlayOffsetX = (containerWidth - renderWidth) / 2;
  const overlayOffsetY = (containerHeight - renderHeight) / 2;

  const remapComp = (comp) => comp;

  /* Early return AFTER all hooks - Ensure we have a valid camera device too! */
  if (!hasPermission || device == null) {
    return (
      <View style={styles.noCameraContainer}>
        <Text style={styles.noCameraText}>Camera not available</Text>
        <Text style={styles.noCameraSubtext}>
          Grant camera permission or use a device with a back camera
        </Text>
      </View>
    );
  }

  const selectedPulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  const selectedPulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });

  /* ═══════════════════════════════════════════════════════
   * Holographic tooltip — floats beside the locked target
   * ═══════════════════════════════════════════════════════ */
  const floatingInfoPanel = (selected && containerSize)
    ? (() => {
        const ts = remapComp(selected);
        const cx = ts.center_x * renderWidth;
        const cy = ts.center_y * renderHeight;
        const dockRight = cx < renderWidth * 0.5;
        const panelW = 168;
        const panelLeft = dockRight
          ? Math.min(cx + (ts.width * renderWidth) / 2 + 14, renderWidth - panelW - 6)
          : Math.max(cx - (ts.width * renderWidth) / 2 - panelW - 10, 6);
        const panelTop = Math.max(Math.min(cy - 40, renderHeight - 200), 52);
        const lineFromX = dockRight
          ? cx + (ts.width * renderWidth) / 2
          : cx - (ts.width * renderWidth) / 2;
        const lineToX = dockRight ? panelLeft : panelLeft + panelW;
        const lineToY = panelTop + 18;

        return (
          <React.Fragment>
            {/* Leader line */}
            <Svg
              width={renderWidth}
              height={renderHeight}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              <SvgLine
                x1={lineFromX}
                y1={cy}
                x2={lineToX}
                y2={lineToY}
                stroke="#FFB74D"
                strokeWidth={1}
                strokeDasharray="4,3"
                opacity={0.6}
              />
              <Circle
                cx={lineFromX}
                cy={cy}
                r={3}
                fill="#FFB74D"
                opacity={0.9}
              />
            </Svg>

            {/* Panel */}
            <Animated.View
              style={[
                styles.floatingPanel,
                {
                  left: panelLeft,
                  top: panelTop,
                  width: panelW,
                  opacity: selectedPulseOpacity,
                },
              ]}
            >
              <View style={styles.floatingPanelHeader}>
                <View
                  style={[
                    styles.floatingDot,
                    { backgroundColor: selected.color || '#4a90d9' },
                  ]}
                />
                <Text style={styles.floatingLabel} numberOfLines={1}>
                  {selected.label}
                </Text>
                <TouchableOpacity
                  onPress={handleDismiss}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.floatingClose}>x</Text>
                </TouchableOpacity>
              </View>

              {selected.confidence != null && (
                <View style={styles.floatingConfRow}>
                  <View style={styles.floatingConfBar}>
                    <View
                      style={[
                        styles.floatingConfFill,
                        {
                          width: `${(selected.confidence * 100).toFixed(0)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.floatingConfText}>
                    {(selected.confidence * 100).toFixed(0)}%
                  </Text>
                </View>
              )}

              <ScrollView
                style={styles.floatingScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {selected.description ? (
                  <Text style={styles.floatingDesc}>
                    {selected.description}
                  </Text>
                ) : null}
                <Text style={styles.floatingConn}>
                  {'>> '}
                  {selected.model_label || 'visual target'} | TRACKED AREA {(selected.area ? (selected.area * 100).toFixed(1) : '0.0')}%
                </Text>
              </ScrollView>
            </Animated.View>
          </React.Fragment>
        );
      })()
    : null;

  /* ═══════════════════════════════════════════════════════
   * Static info panel — used below camera in non-FS mode
   * ═══════════════════════════════════════════════════════ */
  const staticInfoPanel = selected ? (
    <View style={styles.infoPanelOuter}>
      <View style={styles.infoPanelHeader}>
        <View
          style={[
            styles.infoColorDot,
            { backgroundColor: selected.color || '#4a90d9' },
          ]}
        />
        <Text style={styles.infoLabel}>{selected.label}</Text>
        {selected.confidence != null && (
          <View style={styles.confBadge}>
            <Text style={styles.confText}>
              {(selected.confidence * 100).toFixed(0)}%
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.infoCloseX} onPress={handleDismiss}>
          <Text style={styles.infoCloseXText}>x</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.infoScroll} nestedScrollEnabled>
        {selected.description ? (
          <Text style={styles.infoDesc}>{selected.description}</Text>
        ) : null}
        <Text style={styles.infoConnections}>
          Overlay ID: {selected.id} | Surface coverage: {selected.area ? (selected.area * 100).toFixed(1) : '0.0'}%
        </Text>
      </ScrollView>
    </View>
  ) : null;

  /* ═══════════════════════════════════════════════════════
   * Composited camera content
   * ═══════════════════════════════════════════════════════ */
  const cameraContent = (
    // Wrapper always fills its parent (flex:1). Container fills the wrapper (flex:1).
    // Camera fills the container (absoluteFill). AR overlay is centered via overlayOffsetY.
    <View style={styles.wrapperFullscreen}>
      <View
        style={styles.container}
        onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {/* Bare React Native Vision Camera Replacement */}
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={appIsActive}
          photo={true}
          resizeMode="contain"
        />

        {/* Vignette overlays */}
        <View pointerEvents="none" style={styles.vignetteTop} />
        <View pointerEvents="none" style={styles.vignetteBottom} />

        {/* Faint spatial grid */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: gridOpacity }]}
        >
          <Svg
            width={containerWidth}
            height={containerHeight}
            style={StyleSheet.absoluteFill}
          >
            {Array.from(
              { length: Math.floor(containerWidth / 50) + 1 },
              (_, i) => (
                <SvgLine
                  key={`gv-${i}`}
                  x1={i * 50}
                  y1={0}
                  x2={i * 50}
                  y2={containerHeight}
                  stroke="#4a90d9"
                  strokeWidth={0.4}
                />
              ),
            )}
            {Array.from(
              { length: Math.floor(containerHeight / 50) + 1 },
              (_, i) => (
                <SvgLine
                  key={`gh-${i}`}
                  x1={0}
                  y1={i * 50}
                  x2={containerWidth}
                  y2={i * 50}
                  stroke="#4a90d9"
                  strokeWidth={0.4}
                />
              ),
            )}
          </Svg>
        </Animated.View>

        {/* ── AR overlay layer — aligned to contain-scaled camera preview ── */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: overlayOffsetY,
              left: overlayOffsetX,
              width: renderWidth,
              height: renderHeight,
              overflow: 'hidden',
            },
            {
              opacity: fadeIn,
            },
          ]}
        >
          {/* Component holographic frames — only render once onLayout has given us
              real container dimensions; using the initial guess causes boxes to
              land in the wrong positions on the very first render after a scan. */}
          {containerSize && components.map((comp) => {
            const tc = remapComp(comp);
            const x = tc.x * renderWidth;
            const y = tc.y * renderHeight;
            const w = tc.width  * renderWidth;
            const h = tc.height * renderHeight;
            const isSelected = selected?.id === comp.id;
            const color = comp.color || '#4a90d9';
            const borderColor = isSelected ? '#FFB74D' : color;

            return (
              <TouchableOpacity
                key={comp.id}
                activeOpacity={0.85}
                onPress={() => handleSelect(comp)}
                style={[
                  styles.compBox,
                  { left: x, top: y, width: w, height: h },
                ]}
              >
                {/* Depth-fill */}
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: isSelected
                        ? 'rgba(255,183,77,0.12)'
                        : `${color}0A`,
                      borderRadius: 2,
                      opacity: isSelected ? selectedPulseOpacity : 1,
                      transform: isSelected
                        ? [{ scale: selectedPulseScale }]
                        : [],
                    },
                  ]}
                />
                <View
                  style={[
                    styles.compGlow,
                    { backgroundColor: borderColor, opacity: isSelected ? 0.12 : 0.06 },
                  ]}
                />
                <View
                  style={[
                    styles.compTopGlass,
                    { backgroundColor: isSelected ? 'rgba(255,183,77,0.12)' : 'rgba(215,244,255,0.08)' },
                  ]}
                />
                {/* Wireframe */}
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      borderColor,
                      borderWidth: isSelected ? 1.5 : 0.8,
                      borderStyle: isSelected ? 'solid' : 'dashed',
                      borderRadius: 2,
                      opacity: isSelected ? 1 : 0.5,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.baseShadow,
                    {
                      backgroundColor: isSelected ? 'rgba(255,183,77,0.18)' : 'rgba(74,144,217,0.10)',
                      width: Math.max(18, w * 0.6),
                    },
                  ]}
                />
                {/* Corner brackets */}
                <View style={[styles.cornerTL, { borderColor }]} />
                <View style={[styles.cornerTR, { borderColor }]} />
                <View style={[styles.cornerBL, { borderColor }]} />
                <View style={[styles.cornerBR, { borderColor }]} />
                {/* Center dot */}
                <View
                  style={[
                    styles.centerDot,
                    { backgroundColor: borderColor },
                  ]}
                />

                {/* Floating label */}
                {(showLabels || isSelected) && (
                  <View style={styles.labelContainer}>
                    <Animated.View
                      style={[
                        styles.compLabel,
                        {
                          borderLeftColor: borderColor,
                          opacity: isSelected
                            ? selectedPulseOpacity
                            : 0.9,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.compLabelText,
                          isSelected && { color: '#FFB74D' },
                        ]}
                        numberOfLines={1}
                      >
                        {comp.label}
                      </Text>
                      {comp.confidence != null && (
                        <Text
                          style={[
                            styles.compConfText,
                            {
                              color:
                                comp.confidence > 0.85
                                  ? '#4caf50'
                                  : '#FFB74D',
                            },
                          ]}
                        >
                          {(comp.confidence * 100).toFixed(0)}%
                        </Text>
                      )}
                    </Animated.View>
                    {isSelected && (
                      <Animated.View
                        style={[
                          styles.compDataTag,
                          { opacity: hudFlicker },
                        ]}
                      >
                        <Text style={styles.compDataText}>
                          ID:{comp.id.substring(0, 6)} POS:
                          {(comp.x * 100).toFixed(0)},
                          {(comp.y * 100).toFixed(0)}
                        </Text>
                      </Animated.View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Floating holographic info panel */}
          {floatingInfoPanel}
        </Animated.View>

        {/* ── Top HUD bar ── */}
        <View style={styles.topBar}>
          <View style={styles.hudBadge}>
            <Animated.View
              style={[
                styles.liveDot,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.35, 1],
                  }),
                },
              ]}
            />
            <Text style={styles.hudBadgeText}>AR SCAN</Text>
          </View>
          <Animated.View
            style={[styles.hudDataReadout, { opacity: hudFlicker }]}
          >
            <Text style={styles.hudDataText}>
              PROCESSING {components.length} NODES
            </Text>
          </Animated.View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{components.length}</Text>
          </View>
        </View>

        {/* Bottom-left telemetry */}
        <Animated.View
          style={[styles.bottomLeftHud, { opacity: hudFlicker }]}
        >
          <Text style={styles.hudSmallText}>
            RES {containerWidth}x{containerHeight}
          </Text>
          <Text style={styles.hudSmallText}>DEPTH SCAN ACTIVE</Text>
          <Text style={styles.hudSmallText}>
            TAGS {components.length} | HUD LOCK READY
          </Text>
          {selected && (
            <Text style={[styles.hudSmallText, { color: '#FFB74D' }]}>
              LOCK {selected.label.toUpperCase()}
            </Text>
          )}
        </Animated.View>

        {/* Bottom-right timestamp */}
        <Animated.View
          style={[styles.bottomRightHud, { opacity: hudFlicker }]}
        >
          <Text style={styles.hudSmallText}>
            {new Date().toLocaleTimeString('en-GB', { hour12: false })}
          </Text>
        </Animated.View>

        {/* Right-side control strip — labels toggle + dismiss + Ask AI */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, showLabels && styles.ctrlBtnActive]}
            onPress={() => setShowLabels((v) => !v)}
          >
            <Ionicons name={showLabels ? 'text' : 'text-outline'} size={18} color={showLabels ? '#00e6ff' : '#ccc'} />
          </TouchableOpacity>
          {selected && (
            <TouchableOpacity
              style={[styles.ctrlBtn, { borderColor: '#FFB74D' }]}
              onPress={handleDismiss}
            >
              <Ionicons name="close" size={18} color="#FFB74D" />
            </TouchableOpacity>
          )}
          {onAskAI && components.length > 0 && (
            <TouchableOpacity
              style={[styles.ctrlBtn, { borderColor: '#2997ff' }]}
              onPress={onAskAI}
            >
              <Ionicons name="sparkles-outline" size={18} color="#2997ff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Scan status overlay */}
        {scanStatus !== 'idle' && (
          <View style={styles.scanStatusBanner}>
            <Text style={[
              styles.scanStatusText,
              scanStatus === 'done' && { color: '#4caf50' },
              scanStatus === 'error' && { color: '#f44336' },
            ]}>
              {scanStatus === 'capturing' ? 'CAPTURING...' :
               scanStatus === 'processing' ? 'ANALYSING DIAGRAM...' :
               scanStatus === 'done' ? 'SCAN COMPLETE' :
               `ERROR: ${scanError}`}
            </Text>
          </View>
        )}

        {/* Bottom action bar — diagram button | large capture button | spacer */}
        <View style={styles.bottomActionBar}>
          {/* Back to Diagram */}
          {onToggleFullscreen ? (
            <TouchableOpacity style={styles.bottomSideBtn} onPress={onToggleFullscreen} activeOpacity={0.8}>
              <Ionicons name="layers-outline" size={22} color="#ccc" />
              <Text style={styles.bottomSideBtnText}>Diagram</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.bottomSideBtn} />
          )}

          {/* Large capture / analyse button */}
          {onScan && (
            <TouchableOpacity
              style={[styles.captureBtn, scanStatus !== 'idle' && styles.captureBtnActive]}
              onPress={captureAndScan}
              disabled={scanStatus !== 'idle'}
              activeOpacity={0.8}
            >
              <View style={[styles.captureRing, scanStatus !== 'idle' && styles.captureRingActive]}>
                <View style={styles.captureCore}>
                  <Ionicons
                    name={
                      scanStatus === 'capturing' ? 'aperture-outline' :
                      scanStatus === 'processing' ? 'sync-outline' :
                      scanStatus === 'done' ? 'checkmark-circle-outline' :
                      scanStatus === 'error' ? 'alert-circle-outline' :
                      'camera-outline'
                    }
                    size={30}
                    color={
                      scanStatus === 'done' ? '#4caf50' :
                      scanStatus === 'error' ? '#f44336' :
                      '#fff'
                    }
                  />
                </View>
              </View>
              <Text style={[
                styles.captureBtnLabel,
                scanStatus === 'done' && { color: '#4caf50' },
                scanStatus === 'error' && { color: '#f44336' },
              ]}>
                {scanStatus === 'idle' ? 'Capture & Analyse' :
                 scanStatus === 'capturing' ? 'Capturing…' :
                 scanStatus === 'processing' ? 'Analysing…' :
                 scanStatus === 'done' ? 'Complete' :
                 'Error — Retry'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Spacer to balance layout when onScan is absent */}
          {!onScan && <View style={styles.bottomSideBtn} />}

          {/* Right placeholder — keeps capture button centred */}
          <View style={styles.bottomSideBtn} />
        </View>
      </View>

      {/* Static info panel — NON-fullscreen only */}
      {!isFullscreen && staticInfoPanel}
    </View>
  );

  return (
    <>
      {isFullscreen && <StatusBar hidden />}
      {cameraContent}
    </>
  );
}

// ... styles remain completely unchanged
const styles = StyleSheet.create({
  wrapper: {},
  wrapperFullscreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  /* Vignette */
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 40 },
        shadowOpacity: 0.5,
        shadowRadius: 50,
      },
    }),
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 0,
    backgroundColor: 'transparent',
  },

  /* Component frame */
  compBox: {
    position: 'absolute',
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  compGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
  },
  compTopGlass: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: '22%',
    borderRadius: 3,
  },
  baseShadow: {
    position: 'absolute',
    bottom: -8,
    height: 10,
    borderRadius: 999,
    opacity: 1,
  },
  cornerTL: {
    position: 'absolute',
    top: -1,
    left: -1,
    width: CORNER,
    height: CORNER,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  cornerTR: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: CORNER,
    height: CORNER,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  cornerBL: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    width: CORNER,
    height: CORNER,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  cornerBR: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: CORNER,
    height: CORNER,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  centerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },

  /* Label */
  labelContainer: {
    position: 'absolute',
    top: -28,
    left: 0,
    right: 0,
    alignItems: 'flex-start',
  },
  compLabel: {
    backgroundColor: 'rgba(5, 15, 30, 0.82)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    borderLeftWidth: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compLabelText: {
    color: '#d0dff0',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  compConfText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  compDataTag: {
    marginTop: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 2,
  },
  compDataText: {
    color: '#4a90d9',
    fontSize: 7,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.3,
  },

  /* HUD top bar */
  topBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 255, 0.2)',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00e6ff',
  },
  hudBadgeText: {
    color: '#00e6ff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hudDataReadout: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 217, 0.2)',
  },
  hudDataText: {
    color: 'rgba(74, 144, 217, 0.8)',
    fontSize: 8,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.8,
  },
  countBadge: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 255, 0.3)',
  },
  countText: {
    color: '#00e6ff',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  /* Bottom telemetry */
  bottomLeftHud: {
    position: 'absolute',
    bottom: 12,
    left: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 217, 0.2)',
  },
  bottomRightHud: {
    position: 'absolute',
    bottom: 12,
    right: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 217, 0.15)',
  },
  hudSmallText: {
    color: 'rgba(74, 144, 217, 0.75)',
    fontSize: 7,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.6,
    lineHeight: 11,
  },

  /* Control strip */
  controls: {
    position: 'absolute',
    right: 10,
    top: 52,
    zIndex: 10,
    gap: 6,
  },
  ctrlBtn: {
    width: 38,
    height: 38,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  ctrlBtnActive: {
    backgroundColor: 'rgba(0, 230, 255, 0.15)',
    borderColor: 'rgba(0, 230, 255, 0.5)',
  },
  ctrlBtnText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  /* Bottom action bar */
  bottomActionBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 60 : 44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 12,
  },
  bottomSideBtn: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 4,
  },
  bottomSideBtnText: {
    color: '#ccc',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.4,
  },
  captureBtn: {
    alignItems: 'center',
    gap: 6,
  },
  captureBtnActive: {
    opacity: 0.75,
  },
  captureRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  captureRingActive: {
    borderColor: '#00e6ff',
  },
  captureCore: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  captureBtnLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  scanStatusBanner: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 160 : 140,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 255, 0.35)',
    zIndex: 20,
  },
  scanStatusText: {
    color: '#00e6ff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },

  /* Floating panel */
  floatingPanel: {
    position: 'absolute',
    backgroundColor: 'rgba(5, 12, 28, 0.88)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 183, 77, 0.4)',
    padding: 10,
    zIndex: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#FFB74D',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  floatingPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  floatingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  floatingLabel: {
    flex: 1,
    color: '#FFB74D',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textTransform: 'uppercase',
  },
  floatingClose: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingLeft: 6,
  },
  floatingConfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  floatingConfBar: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginRight: 6,
    overflow: 'hidden',
  },
  floatingConfFill: {
    height: 3,
    backgroundColor: '#4caf50',
    borderRadius: 2,
  },
  floatingConfText: {
    color: '#4caf50',
    fontSize: 9,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  floatingScroll: { maxHeight: 80 },
  floatingDesc: {
    color: '#a0b4cc',
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 4,
  },
  floatingConn: {
    color: '#4a90d9',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.3,
  },

  /* Static info panel */
  infoPanelOuter: {
    marginTop: 8,
    backgroundColor: 'rgba(5, 12, 28, 0.95)',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 217, 0.4)',
    maxHeight: 220,
  },
  infoPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  infoColorDot: { width: 10, height: 10, borderRadius: 5 },
  infoLabel: {
    color: '#FFB74D',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  confBadge: {
    backgroundColor: 'rgba(76,175,80,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confText: { color: '#4caf50', fontSize: 11, fontWeight: '700' },
  infoCloseX: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  infoCloseXText: {
    color: '#c8d6e5',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  infoScroll: { maxHeight: 150 },
  infoDesc: {
    color: '#c8d6e5',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  infoConnections: {
    color: '#8ab4f8',
    fontSize: 12,
    fontStyle: 'italic',
  },

  /* No-camera fallback */
  noCameraContainer: {
    flex: 1,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a1628',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 217, 0.3)',
    margin: 16,
  },
  noCameraText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  noCameraSubtext: {
    color: '#8B92A0',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});