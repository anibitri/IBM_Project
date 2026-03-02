import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import AROverlay from './AROverlay';
import { colors } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CameraARView({
  components,
  selectedComponent,
  onComponentPress,
  imageDimensions,
}) {
  const device = useCameraDevice('back');

  if (!device) {
    return (
      <View style={styles.noCameraContainer}>
        <Text style={styles.noCameraIcon}>📷</Text>
        <Text style={styles.noCameraText}>Camera not available</Text>
        <Text style={styles.noCameraSubtext}>
          Grant camera permission or use a device with a camera
        </Text>
      </View>
    );
  }

  const displayWidth = SCREEN_WIDTH - 32;
  const aspectRatio = imageDimensions.height / imageDimensions.width;
  const displayHeight = displayWidth * (aspectRatio || 0.75);

  return (
    <View style={[styles.container, { width: displayWidth, height: displayHeight }]}>
      {/* Live camera feed */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
      />

      {/* AR overlay — component boxes on camera feed */}
      <View style={styles.overlay}>
        <AROverlay
          components={components}
          imageDimensions={imageDimensions}
          selectedComponent={selectedComponent}
          onComponentPress={onComponentPress}
        />
      </View>

      {/* Mode badge */}
      <View style={styles.badge}>
        <Text style={styles.badgeText}>📷 Camera AR</Text>
      </View>

      {/* Component count */}
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{components.length} components</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  countBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    backgroundColor: 'rgba(74, 144, 217, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  countText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  noCameraContainer: {
    width: SCREEN_WIDTH - 32,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  noCameraIcon: {
    fontSize: 32,
    marginBottom: 12,
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
