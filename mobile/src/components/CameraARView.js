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
  TouchableOpacity,
  Animated,
  StatusBar,
  SafeAreaView,
  Modal,
  Platform,
  ScrollView,
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PARALLAX_FACTOR = 28;
const SENSOR_INTERVAL = 50;
const SMOOTHING = 0.18;
const CORNER = 12;

export default function CameraARView({
  components,
  connections = [],
  selectedComponent,
  onComponentPress,
  imageDimensions,
  showLabels: showLabelsProp = true,
  fullscreen: fullscreenProp = false,
  onToggleFullscreen,
  onScan,
}) {
  // Vision Camera hooks
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef(null);

  const [showLabels, setShowLabels] = useState(showLabelsProp);
  const [internalSelected, setInternalSelected] = useState(null);
  const [scanStatus, setScanStatus] = useState('idle'); // 'idle' | 'capturing' | 'processing' | 'done' | 'error'
  const [scanError, setScanError] = useState(null);

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

  /* ── Scan beam — sweeps top-to-bottom like a lidar pass ── */
  const scanY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanY, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.delay(800),
        Animated.timing(scanY, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ).start();
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
  const displayWidth = isFullscreen ? SCREEN_WIDTH : SCREEN_WIDTH - 32;
  const aspectRatio =
    (imageDimensions?.height || 600) / (imageDimensions?.width || 800);
  const displayHeight = isFullscreen
    ? SCREEN_HEIGHT
    : displayWidth * (aspectRatio || 0.75);

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

  const scanTranslateY = scanY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, displayHeight],
  });

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
  const floatingInfoPanel = selected
    ? (() => {
        const cx = selected.center_x * displayWidth;
        const cy = selected.center_y * displayHeight;
        const dockRight = cx < displayWidth * 0.5;
        const panelW = 168;
        const panelLeft = dockRight
          ? Math.min(
              cx + (selected.width * displayWidth) / 2 + 14,
              displayWidth - panelW - 6,
            )
          : Math.max(
              cx - (selected.width * displayWidth) / 2 - panelW - 10,
              6,
            );
        const panelTop = Math.max(
          Math.min(cy - 40, displayHeight - 200),
          52,
        );
        const lineFromX = dockRight
          ? cx + (selected.width * displayWidth) / 2
          : cx - (selected.width * displayWidth) / 2;
        const lineToX = dockRight ? panelLeft : panelLeft + panelW;
        const lineToY = panelTop + 18;

        return (
          <React.Fragment>
            {/* Leader line */}
            <Svg
              width={displayWidth}
              height={displayHeight}
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
    <View style={[styles.wrapper, isFullscreen && styles.wrapperFullscreen]}>
      <View
        style={[
          styles.container,
          { width: displayWidth, height: displayHeight },
          isFullscreen && styles.containerFullscreen,
        ]}
      >
        {/* Bare React Native Vision Camera Replacement */}
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
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
            width={displayWidth}
            height={displayHeight}
            style={StyleSheet.absoluteFill}
          >
            {Array.from(
              { length: Math.floor(displayWidth / 50) + 1 },
              (_, i) => (
                <SvgLine
                  key={`gv-${i}`}
                  x1={i * 50}
                  y1={0}
                  x2={i * 50}
                  y2={displayHeight}
                  stroke="#4a90d9"
                  strokeWidth={0.4}
                />
              ),
            )}
            {Array.from(
              { length: Math.floor(displayHeight / 50) + 1 },
              (_, i) => (
                <SvgLine
                  key={`gh-${i}`}
                  x1={0}
                  y1={i * 50}
                  x2={displayWidth}
                  y2={i * 50}
                  stroke="#4a90d9"
                  strokeWidth={0.4}
                />
              ),
            )}
          </Svg>
        </Animated.View>

        {/* Scan beam + trail */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanBeam,
            {
              width: displayWidth,
              transform: [{ translateY: scanTranslateY }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanTrail,
            {
              width: displayWidth,
              transform: [{ translateY: scanTranslateY }],
            },
          ]}
        />

        {/* ── Parallax AR layer ── */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              transform: [
                { translateX: offsetX },
                { translateY: offsetY },
              ],
              opacity: fadeIn,
            },
          ]}
        >
          {/* Component holographic frames */}
          {components.map((comp) => {
            const x = comp.x * displayWidth;
            const y = comp.y * displayHeight;
            const w = comp.width * displayWidth;
            const h = comp.height * displayHeight;
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
            RES {displayWidth}x{Math.round(displayHeight)}
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

        {/* Right-side control strip */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.ctrlBtn, showLabels && styles.ctrlBtnActive]}
            onPress={() => setShowLabels((v) => !v)}
          >
            <Ionicons name={showLabels ? 'text' : 'text-outline'} size={18} color={showLabels ? '#00e6ff' : '#ccc'} />
          </TouchableOpacity>
          {onToggleFullscreen && (
            <TouchableOpacity
              style={styles.ctrlBtn}
              onPress={onToggleFullscreen}
            >
              <Ionicons name={isFullscreen ? 'contract-outline' : 'expand-outline'} size={18} color="#ccc" />
            </TouchableOpacity>
          )}
          {selected && (
            <TouchableOpacity
              style={[styles.ctrlBtn, { borderColor: '#FFB74D' }]}
              onPress={handleDismiss}
            >
              <Ionicons name="close" size={18} color="#FFB74D" />
            </TouchableOpacity>
          )}
          {onScan && (
            <TouchableOpacity
              style={[
                styles.ctrlBtn,
                styles.scanBtn,
                scanStatus !== 'idle' && styles.scanBtnActive,
              ]}
              onPress={captureAndScan}
              disabled={scanStatus !== 'idle'}
            >
              <Ionicons
                name={
                  scanStatus === 'capturing' ? 'aperture-outline' :
                  scanStatus === 'processing' ? 'sync-outline' :
                  scanStatus === 'done' ? 'checkmark-circle-outline' :
                  scanStatus === 'error' ? 'alert-circle-outline' :
                  'scan-outline'
                }
                size={20}
                color={
                  scanStatus === 'done' ? '#4caf50' :
                  scanStatus === 'error' ? '#f44336' :
                  '#00e6ff'
                }
              />
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
      </View>

      {/* Static info panel — NON-fullscreen only */}
      {!isFullscreen && staticInfoPanel}
    </View>
  );

  if (isFullscreen) {
    return (
      <Modal
        visible
        animationType="slide"
        statusBarTranslucent
        supportedOrientations={['portrait']}
      >
        <StatusBar hidden />
        <SafeAreaView style={styles.fullscreenSafe}>
          {cameraContent}
        </SafeAreaView>
      </Modal>
    );
  }

  return cameraContent;
}

// ... styles remain completely unchanged
const styles = StyleSheet.create({
  wrapper: {},
  wrapperFullscreen: { flex: 1 },
  container: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  containerFullscreen: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    borderRadius: 0,
    flex: 1,
  },
  fullscreenSafe: { flex: 1, backgroundColor: '#000' },

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
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  /* Scan beam */
  scanBeam: {
    position: 'absolute',
    left: 0,
    height: 2,
    backgroundColor: 'rgba(0, 230, 255, 0.65)',
    zIndex: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#00e6ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
    }),
  },
  scanTrail: {
    position: 'absolute',
    left: 0,
    height: 60,
    zIndex: 5,
    backgroundColor: 'rgba(0, 230, 255, 0.04)',
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
  scanBtn: {
    borderColor: 'rgba(0, 230, 255, 0.5)',
    marginTop: 6,
  },
  scanBtnActive: {
    backgroundColor: 'rgba(0, 230, 255, 0.15)',
    borderColor: '#00e6ff',
  },
  scanStatusBanner: {
    position: 'absolute',
    bottom: 52,
    left: 10,
    right: 60,
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
    width: SCREEN_WIDTH - 32,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a1628',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 217, 0.3)',
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