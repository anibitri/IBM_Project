import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, {
  Rect, G, Line, Circle, Text as SvgText,
  Defs, LinearGradient, Stop,
} from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ACCENT     = '#4a90d9';
const ACCENT_SEL = '#FFB74D';
const LABEL_BG   = 'rgba(10, 22, 40, 0.85)';
const CORNER_LEN = 8;

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

  // Build component lookup for connections
  const compMap = {};
  components.forEach((c) => { compMap[c.id] = c; });

  return (
    <View style={[styles.overlay, { width: displayWidth, height: displayHeight }]}>
      <Svg width={displayWidth} height={displayHeight}>
        <Defs>
          <LinearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ACCENT} stopOpacity="0" />
            <Stop offset="0.5" stopColor={ACCENT} stopOpacity="0.15" />
            <Stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* ── Connection lines (dashed, like web Three.js) ── */}
        {connections.map((conn, i) => {
          const from = compMap[conn.from];
          const to   = compMap[conn.to];
          if (!from || !to) return null;
          const fx = from.center_x * displayWidth;
          const fy = from.center_y * displayHeight;
          const tx = to.center_x   * displayWidth;
          const ty = to.center_y   * displayHeight;
          const isRelated =
            selectedComponent &&
            (conn.from === selectedComponent.id || conn.to === selectedComponent.id);
          return (
            <Line
              key={`conn-${i}`}
              x1={fx} y1={fy} x2={tx} y2={ty}
              stroke={isRelated ? ACCENT_SEL : '#2e5a88'}
              strokeWidth={isRelated ? 1.8 : 1}
              strokeDasharray={isRelated ? '6,3' : '4,4'}
              strokeLinecap="round"
              opacity={isRelated ? 0.9 : 0.45}
            />
          );
        })}

        {/* ── Components ──────────────────────────────── */}
        {components.map((comp) => {
          const x = comp.x * displayWidth;
          const y = comp.y * displayHeight;
          const w = comp.width  * displayWidth;
          const h = comp.height * displayHeight;
          const isSelected = selectedComponent?.id === comp.id;
          const color = isSelected ? ACCENT_SEL : (comp.color || ACCENT);
          const labelText = (comp.label || '').substring(0, 20);

          return (
            <G key={comp.id} onPress={() => onComponentPress?.(comp)}>
              {/* Invisible hit area */}
              <Rect x={x} y={y} width={w} height={h} fill="transparent" />

              {/* Semi-transparent fill */}
              <Rect
                x={x} y={y} width={w} height={h}
                fill={color}
                opacity={isSelected ? 0.18 : 0.06}
                rx={2}
              />

              {/* Full wireframe border (subtle) */}
              <Rect
                x={x} y={y} width={w} height={h}
                fill="none"
                stroke={color}
                strokeWidth={isSelected ? 1.5 : 0.5}
                strokeDasharray={isSelected ? '' : '3,3'}
                opacity={isSelected ? 1 : 0.35}
                rx={2}
              />

              {/* Corner brackets (HUD targeting style) */}
              <CornerBrackets
                x={x} y={y} w={w} h={h}
                color={color}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />

              {/* Center crosshair dot */}
              {comp.center_x != null && comp.center_y != null && (
                <Circle
                  cx={comp.center_x * displayWidth}
                  cy={comp.center_y * displayHeight}
                  r={isSelected ? 3.5 : 2}
                  fill={color}
                  opacity={isSelected ? 1 : 0.6}
                />
              )}

              {/* ── Label + confidence badge ── */}
              {labelText.length > 0 && (showLabels || isSelected) && (
                <G>
                  {/* Label background pill */}
                  <Rect
                    x={x}
                    y={Math.max(0, y - 20)}
                    width={Math.min(labelText.length * 7.5 + 38, w + 20)}
                    height={18}
                    rx={4}
                    fill={LABEL_BG}
                    stroke={color}
                    strokeWidth={0.8}
                  />
                  {/* Label text */}
                  <SvgText
                    x={x + 5}
                    y={Math.max(13, y - 6)}
                    fill={isSelected ? ACCENT_SEL : '#c8d6e5'}
                    fontSize="10"
                    fontWeight="bold"
                  >
                    {labelText}
                  </SvgText>
                  {/* Confidence badge */}
                  {comp.confidence != null && (
                    <SvgText
                      x={x + labelText.length * 7.5 + 12}
                      y={Math.max(13, y - 6)}
                      fill={comp.confidence > 0.9 ? '#4caf50' : comp.confidence > 0.8 ? ACCENT : ACCENT_SEL}
                      fontSize="9"
                    >
                      {(comp.confidence * 100).toFixed(0)}%
                    </SvgText>
                  )}
                </G>
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});