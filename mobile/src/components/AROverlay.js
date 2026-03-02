import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, G, Circle, Text as SvgText, Line } from 'react-native-svg';
import { colors } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Decide whether the label should be hidden because the box is large
 * enough that its text is already readable inside the diagram.
 */
function shouldHideLabel(comp, displayWidth, displayHeight) {
  const boxArea = (comp.width * displayWidth) * (comp.height * displayHeight);
  const totalArea = displayWidth * displayHeight;
  return boxArea > totalArea * 0.008;
}

export default function AROverlay({
  components,
  connections = [],
  imageDimensions,
  selectedComponent,
  onComponentPress,
}) {
  if (!imageDimensions.width || !imageDimensions.height || components.length === 0) {
    return null;
  }

  // Calculate display dimensions (accounting for padding)
  const displayWidth = SCREEN_WIDTH - 32; // 16px padding on each side
  const aspectRatio = imageDimensions.height / imageDimensions.width;
  const displayHeight = displayWidth * aspectRatio;

  // Build a lookup map for component centres
  const compMap = {};
  components.forEach((c) => {
    compMap[c.id] = c;
  });

  return (
    <View style={[styles.overlay, { width: displayWidth, height: displayHeight }]}>
      <Svg width={displayWidth} height={displayHeight}>
        {/* ── Connection lines ─────────────────────────── */}
        {connections.map((conn, idx) => {
          const src = compMap[conn.from];
          const dst = compMap[conn.to];
          if (!src || !dst) return null;

          const x1 = (src.x + src.width / 2) * displayWidth;
          const y1 = (src.y + src.height / 2) * displayHeight;
          const x2 = (dst.x + dst.width / 2) * displayWidth;
          const y2 = (dst.y + dst.height / 2) * displayHeight;

          return (
            <Line
              key={`conn-${idx}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={colors.arBox}
              strokeWidth={1.5}
              strokeDasharray="6,4"
              opacity={0.7}
            />
          );
        })}

        {/* ── Components ───────────────────────────────── */}
        {components.map((comp) => {
          const x = comp.x * displayWidth;
          const y = comp.y * displayHeight;
          const width = comp.width * displayWidth;
          const height = comp.height * displayHeight;
          const isSelected = selectedComponent?.id === comp.id;
          const hideLabel = shouldHideLabel(comp, displayWidth, displayHeight);

          const labelText = (comp.label || '').substring(0, 20);
          const labelWidth = Math.min(labelText.length * 8 + 10, width);
          const showLabel = labelText.length > 0 && (!hideLabel || isSelected);

          return (
            <G key={comp.id} onPress={() => onComponentPress(comp)}>
              {/* Invisible hit area for touch */}
              <Rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill="transparent"
              />

              {/* Bounding Box */}
              <Rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill="none"
                stroke={isSelected ? colors.arBoxSelected : colors.arBox}
                strokeWidth={isSelected ? 4 : 2}
              />

              {/* Label Background */}
              {showLabel && (
                <Rect
                  x={x}
                  y={Math.max(0, y - 22)}
                  width={labelWidth}
                  height={20}
                  fill={isSelected ? colors.arBoxSelected : colors.arBox}
                  opacity={0.9}
                />
              )}

              {/* Label Text */}
              {showLabel && (
                <SvgText
                  x={x + 5}
                  y={Math.max(13, y - 8)}
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                >
                  {labelText}
                </SvgText>
              )}

              {/* Center Point */}
              {comp.center_x != null && comp.center_y != null && (
                <Circle
                  cx={comp.center_x * displayWidth}
                  cy={comp.center_y * displayHeight}
                  r={isSelected ? 5 : 3}
                  fill={isSelected ? colors.arBoxSelected : colors.arBox}
                />
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