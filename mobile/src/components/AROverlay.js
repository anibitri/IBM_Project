import React from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Rect, Circle, Text as SvgText } from 'react-native-svg';
import { colors } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function AROverlay({
  components,
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

  return (
    <View style={[styles.overlay, { width: displayWidth, height: displayHeight }]}>
      <Svg width={displayWidth} height={displayHeight}>
        {components.map((comp) => {
          const x = comp.x * displayWidth;
          const y = comp.y * displayHeight;
          const width = comp.width * displayWidth;
          const height = comp.height * displayHeight;
          const isSelected = selectedComponent?.id === comp.id;

          return (
            <TouchableOpacity
              key={comp.id}
              onPress={() => onComponentPress(comp)}
              activeOpacity={0.7}
            >
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
              <Rect
                x={x}
                y={y - 22}
                width={Math.min(comp.label.length * 8 + 10, width)}
                height={20}
                fill={isSelected ? colors.arBoxSelected : colors.arBox}
                opacity={0.9}
              />

              {/* Label Text */}
              <SvgText
                x={x + 5}
                y={y - 8}
                fill="white"
                fontSize="12"
                fontWeight="bold"
              >
                {comp.label.substring(0, 20)}
              </SvgText>

              {/* Center Point */}
              <Circle
                cx={comp.center_x * displayWidth}
                cy={comp.center_y * displayHeight}
                r={isSelected ? 5 : 3}
                fill={isSelected ? colors.arBoxSelected : colors.arBox}
              />
            </TouchableOpacity>
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