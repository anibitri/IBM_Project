import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import Svg, {
  Rect, G, Line, Circle, Text as SvgText, Path, Ellipse,
  Defs, LinearGradient, Stop,
} from 'react-native-svg';
import { FlowParticle } from './FlowAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ACCENT     = '#4a90d9';
const ACCENT_SEL = '#FFB74D';
const LABEL_BG   = 'rgba(10, 22, 40, 0.85)';
const CORNER_LEN = 8;
const PALETTE = ['#4a90d9', '#36d399', '#a78bfa', '#f59e0b', '#fb7185', '#2dd4bf'];

function getComponentColor(comp, index) {
  if (comp.color) return comp.color;
  const seed = `${comp.id || ''}${comp.label || ''}`;
  let hash = 0;
  for (let idx = 0; idx < seed.length; idx += 1) {
    hash = (hash * 31 + seed.charCodeAt(idx)) >>> 0;
  }
  return PALETTE[(hash + index) % PALETTE.length];
}

function getLabelWidth(text) {
  return Math.max(96, Math.min(180, text.length * 7.1 + 58));
}

function formatComponentLabel(comp) {
  const raw = comp.model_label || comp.label || 'Component';
  if (/^dino\d+$/i.test(raw)) {
    return `Target ${raw.replace(/[^0-9]/g, '') || ''}`.trim();
  }
  return raw.replace(/[_-]+/g, ' ').trim();
}

/**
 * Draw targeting-bracket corners instead of a full rectangle.
 * Gives an AR/HUD aesthetic similar to the web Three.js wireframe boxes.
 */
function CornerBrackets({ x, y, w, h, color, strokeWidth = 1.5 }) {
  const cl = Math.min(CORNER_LEN, w * 0.25, h * 0.25);
  return (
    <G>
      {/* Top-left */}
      <Line x1={x} y1={y + cl} x2={x} y2={y} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={x} y1={y} x2={x + cl} y2={y} stroke={color} strokeWidth={strokeWidth} />
      {/* Top-right */}
      <Line x1={x + w - cl} y1={y} x2={x + w} y2={y} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={x + w} y1={y} x2={x + w} y2={y + cl} stroke={color} strokeWidth={strokeWidth} />
      {/* Bottom-right */}
      <Line x1={x + w} y1={y + h - cl} x2={x + w} y2={y + h} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={x + w} y1={y + h} x2={x + w - cl} y2={y + h} stroke={color} strokeWidth={strokeWidth} />
      {/* Bottom-left */}
      <Line x1={x} y1={y + h} x2={x} y2={y + h - cl} stroke={color} strokeWidth={strokeWidth} />
      <Line x1={x + cl} y1={y + h} x2={x} y2={y + h} stroke={color} strokeWidth={strokeWidth} />
    </G>
  );
}

export default function AROverlay({
  components,
  connections = [],
  imageDimensions,
  selectedComponent,
  onComponentPress,
  showLabels = true,
  cameraMode = false,
}) {
  if (
    !imageDimensions?.width ||
    !imageDimensions?.height ||
    components.length === 0
  ) {
    return null;
  }

  const displayWidth  = cameraMode
    ? (imageDimensions.displayWidth  || (SCREEN_WIDTH - 32))
    : (SCREEN_WIDTH - 32);
  const displayHeight = cameraMode
    ? (imageDimensions.displayHeight || displayWidth * (imageDimensions.height / imageDimensions.width))
    : displayWidth * (imageDimensions.height / imageDimensions.width);

  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(550),
      ]),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    scanLoop.start();
    pulseLoop.start();
    return () => {
      scanLoop.stop();
      pulseLoop.stop();
    };
  }, [pulseAnim, scanAnim]);

  const scanTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, displayHeight],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.82],
  });

  const hudGrid = useMemo(() => ({
    vertical: Array.from({ length: Math.floor(displayWidth / 44) + 1 }, (_, index) => index * 44),
    horizontal: Array.from({ length: Math.floor(displayHeight / 44) + 1 }, (_, index) => index * 44),
  }), [displayHeight, displayWidth]);

  return (
    <View style={[styles.overlay, { width: displayWidth, height: displayHeight }]}>
      <Svg width={displayWidth} height={displayHeight}>
        <Defs>
          <LinearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ACCENT} stopOpacity="0" />
            <Stop offset="0.5" stopColor={ACCENT} stopOpacity="0.15" />
            <Stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="hudGlass" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#d7f4ff" stopOpacity="0.12" />
            <Stop offset="0.45" stopColor="#69c8ff" stopOpacity="0.06" />
            <Stop offset="1" stopColor="#0a1628" stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={displayWidth} height={displayHeight} fill="url(#hudGlass)" rx={8} />

        {hudGrid.vertical.map((x) => (
          <Line
            key={`v-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={displayHeight}
            stroke="#7dd3fc"
            strokeWidth={0.35}
            opacity={0.08}
          />
        ))}
        {hudGrid.horizontal.map((y) => (
          <Line
            key={`h-${y}`}
            x1={0}
            y1={y}
            x2={displayWidth}
            y2={y}
            stroke="#7dd3fc"
            strokeWidth={0.35}
            opacity={0.08}
          />
        ))}

        <Rect x={6} y={6} width={displayWidth - 12} height={displayHeight - 12} rx={8} fill="none" stroke="#8be9fd" strokeWidth={0.6} opacity={0.26} />
        <Line x1={12} y1={12} x2={36} y2={12} stroke="#8be9fd" strokeWidth={1.2} opacity={0.7} />
        <Line x1={12} y1={12} x2={12} y2={36} stroke="#8be9fd" strokeWidth={1.2} opacity={0.7} />
        <Line x1={displayWidth - 36} y1={12} x2={displayWidth - 12} y2={12} stroke="#8be9fd" strokeWidth={1.2} opacity={0.7} />
        <Line x1={displayWidth - 12} y1={12} x2={displayWidth - 12} y2={36} stroke="#8be9fd" strokeWidth={1.2} opacity={0.7} />
        <Line x1={12} y1={displayHeight - 12} x2={36} y2={displayHeight - 12} stroke="#8be9fd" strokeWidth={1.2} opacity={0.7} />
        <Line x1={12} y1={displayHeight - 36} x2={12} y2={displayHeight - 12} stroke="#8be9fd" strokeWidth={1.2} opacity={0.7} />
        <Line x1={displayWidth - 36} y1={displayHeight - 12} x2={displayWidth - 12} y2={displayHeight - 12} stroke="#8be9fd" strokeWidth={1.2} opacity={0.7} />
        <Line x1={displayWidth - 12} y1={displayHeight - 36} x2={displayWidth - 12} y2={displayHeight - 12} stroke="#8be9fd" strokeWidth={1.2} opacity={0.7} />

        {/* ── Connection lines ────────────────────────── */}
        {connections.map((conn, i) => {
          const fromComp = components.find(c => c.id === conn.from);
          const toComp   = components.find(c => c.id === conn.to);
          if (!fromComp || !toComp) return null;
          const fx = fromComp.center_x * displayWidth;
          const fy = fromComp.center_y * displayHeight;
          const tx = toComp.center_x   * displayWidth;
          const ty = toComp.center_y   * displayHeight;
          return (
            <Line
              key={`cl-${i}`}
              x1={fx} y1={fy} x2={tx} y2={ty}
              stroke={ACCENT}
              strokeWidth={1}
              strokeDasharray="6,4"
              opacity={0.35}
            />
          );
        })}

        {/* ── Components ──────────────────────────────── */}
        {components.map((comp, index) => {
          const x = comp.x * displayWidth;
          const y = comp.y * displayHeight;
          const w = comp.width  * displayWidth;
          const h = comp.height * displayHeight;
          const isSelected = selectedComponent?.id === comp.id;
          const color = isSelected ? ACCENT_SEL : getComponentColor(comp, index);
          const labelText = formatComponentLabel(comp).substring(0, 24);
          const labelWidth = getLabelWidth(labelText);
          const labelY = y > 30 ? y - 24 : y + h + 8;
          const labelTextY = labelY + 13;
          const centerX = comp.center_x * displayWidth;
          const centerY = comp.center_y * displayHeight;
          const panelDockX = Math.min(Math.max(x, 6), displayWidth - labelWidth - 6);
          const leaderStartY = labelY < y ? labelY + 18 : labelY;
          const componentId = String(comp.id || '').toUpperCase();

          return (
            <G key={comp.id} onPress={() => onComponentPress?.(comp)}>
              {/* Invisible hit area */}
              <Rect x={x} y={y} width={w} height={h} fill="transparent" />

              <Ellipse
                cx={centerX}
                cy={y + h + Math.min(10, h * 0.16)}
                rx={Math.max(10, w * 0.42)}
                ry={Math.max(4, h * 0.12)}
                fill={color}
                opacity={isSelected ? 0.2 : 0.08}
              />

              <Rect
                x={x - 2}
                y={y - 2}
                width={w + 4}
                height={h + 4}
                fill={color}
                opacity={isSelected ? 0.13 : 0.05}
                rx={4}
              />

              <Rect
                x={x} y={y} width={w} height={h}
                fill="url(#hudGlass)"
                opacity={isSelected ? 0.92 : 0.82}
                rx={4}
              />

              <Rect
                x={x}
                y={y}
                width={w}
                height={Math.max(4, h * 0.18)}
                fill={color}
                opacity={isSelected ? 0.16 : 0.1}
                rx={4}
              />

              <Rect
                x={x} y={y} width={w} height={h}
                fill="none"
                stroke={color}
                strokeWidth={isSelected ? 1.8 : 1}
                strokeDasharray={isSelected ? '' : '6,4'}
                opacity={isSelected ? 0.98 : 0.72}
                rx={4}
              />

              <Rect
                x={x + 3}
                y={y + 3}
                width={Math.max(0, w - 6)}
                height={Math.max(0, h - 6)}
                fill="none"
                stroke="#d8f3ff"
                strokeWidth={0.5}
                opacity={isSelected ? 0.5 : 0.24}
                rx={3}
              />

              <CornerBrackets
                x={x} y={y} w={w} h={h}
                color={color}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />

              <Line x1={centerX - 8} y1={centerY} x2={centerX + 8} y2={centerY} stroke={color} strokeWidth={0.9} opacity={0.8} />
              <Line x1={centerX} y1={centerY - 8} x2={centerX} y2={centerY + 8} stroke={color} strokeWidth={0.9} opacity={0.8} />
              <Circle cx={centerX} cy={centerY} r={isSelected ? 3.8 : 2.4} fill={color} opacity={0.9} />
              {isSelected && (
                <Circle cx={centerX} cy={centerY} r={12} stroke={color} strokeWidth={1} fill="none" opacity={0.45} />
              )}

              <Line x1={x + 4} y1={y + h - 6} x2={x + Math.min(26, w * 0.45)} y2={y + h - 6} stroke={color} strokeWidth={1.1} opacity={0.85} />
              <Line x1={x + w - Math.min(26, w * 0.45)} y1={y + h - 6} x2={x + w - 4} y2={y + h - 6} stroke={color} strokeWidth={1.1} opacity={0.85} />

              {labelText.length > 0 && (showLabels || isSelected) && (
                <G>
                  <Path
                    d={`M${centerX},${centerY} L${centerX},${leaderStartY} L${panelDockX + 10},${leaderStartY}`}
                    stroke={color}
                    strokeWidth={0.9}
                    strokeDasharray="4,4"
                    fill="none"
                    opacity={0.75}
                  />

                  <Rect
                    x={panelDockX}
                    y={labelY}
                    width={labelWidth}
                    height={20}
                    rx={4}
                    fill={LABEL_BG}
                    stroke={color}
                    strokeWidth={0.9}
                  />
                  <Rect
                    x={panelDockX + 3}
                    y={labelY + 3}
                    width={labelWidth - 6}
                    height={14}
                    rx={3}
                    fill={color}
                    opacity={0.08}
                  />
                  <SvgText
                    x={panelDockX + 7}
                    y={labelTextY}
                    fill={isSelected ? ACCENT_SEL : '#c8d6e5'}
                    fontSize="10"
                    fontWeight="bold"
                  >
                    {labelText}
                  </SvgText>

                  <SvgText
                    x={panelDockX + labelWidth - 44}
                    y={labelTextY}
                    fill="#7dd3fc"
                    fontSize="8.5"
                    letterSpacing="0.8"
                  >
                    {componentId.slice(0, 8)}
                  </SvgText>

                  {comp.confidence != null && (
                    <G>
                      <Rect
                        x={panelDockX}
                        y={labelY + 22}
                        width={Math.min(84, Math.max(48, w * 0.7))}
                        height={8}
                        rx={4}
                        fill="rgba(8,18,32,0.75)"
                        stroke={color}
                        strokeWidth={0.5}
                      />
                      <Rect
                        x={panelDockX + 1}
                        y={labelY + 23}
                        width={(Math.min(84, Math.max(48, w * 0.7)) - 2) * Math.max(0.08, Math.min(1, comp.confidence))}
                        height={6}
                        rx={3}
                        fill={comp.confidence > 0.9 ? '#4ade80' : comp.confidence > 0.8 ? color : ACCENT_SEL}
                        opacity={0.95}
                      />
                      <SvgText
                        x={panelDockX + Math.min(84, Math.max(48, w * 0.7)) + 6}
                        y={labelY + 29}
                        fill={comp.confidence > 0.9 ? '#4ade80' : '#f8d16b'}
                        fontSize="9"
                        fontWeight="bold"
                      >
                        {(comp.confidence * 100).toFixed(0)}%
                      </SvgText>
                    </G>
                  )}
                </G>
              )}
            </G>
          );
        })}
      </Svg>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.scanTrail,
          {
            width: displayWidth,
            transform: [{ translateY: scanTranslateY }],
            opacity: pulseOpacity,
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.scanLine,
          {
            width: displayWidth,
            transform: [{ translateY: scanTranslateY }],
            opacity: pulseOpacity,
          },
        ]}
      />

      {connections.map((conn, i) => {
        const fromComp = components.find(c => c.id === conn.from);
        const toComp   = components.find(c => c.id === conn.to);
        if (!fromComp || !toComp) return null;
        const color =
          conn.type === 'otlp'     ? '#00e6ff' :
          conn.type === 'https' || conn.type === 'http' ? '#FFB74D' :
          conn.type === 'internal' ? '#4ade80' :
          conn.type === 'signal'   ? '#a78bfa' :
          '#4a90d9';
        return (
          <FlowParticle
            key={`fp-${i}`}
            from={{ x: fromComp.center_x * displayWidth, y: fromComp.center_y * displayHeight }}
            to={{ x: toComp.center_x * displayWidth,   y: toComp.center_y   * displayHeight }}
            speed={2200}
            color={color}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    height: 2,
    backgroundColor: 'rgba(125, 211, 252, 0.9)',
    shadowColor: '#7dd3fc',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  scanTrail: {
    position: 'absolute',
    left: 0,
    height: 56,
    backgroundColor: 'rgba(125, 211, 252, 0.08)',
  },
});