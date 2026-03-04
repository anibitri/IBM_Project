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
} from 'react-native';
import { useDocumentContext } from '@ar-viewer/shared';
import AROverlay from '../components/AROverlay';
import CameraARView from '../components/CameraARView';
import { colors, spacing, typography } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DiagramScreen({ navigation }) {
  const { document, clearDocument } = useDocumentContext();
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [cameraMode, setCameraMode] = useState(false);
  const [showLabels, setShowLabels] = useState(true);

  // Pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        // Only capture gestures when zoomed in and the user is clearly dragging
        return zoom > 1 && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5);
      },
      onPanResponderGrant: () => {
        panRef.current = { ...pan };
      },
      onPanResponderMove: (_, gs) => {
        setPan({
          x: panRef.current.x + gs.dx,
          y: panRef.current.y + gs.dy,
        });
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  // Reset pan when zoom resets
  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  useEffect(() => {
    if (!document) {
      navigation.replace('Upload');
    }
  }, [document, navigation]);

  if (!document) {
    return null;
  }

  const components = document.ar?.components || [];
  const connections = document.ar?.relationships?.connections || [];
  const imageUrl = document.file?.url || '';

  const handleImageLoad = (event) => {
    const { width, height } = event.nativeEvent.source;
    setImageDimensions({ width, height });
  };

  const handleNewUpload = () => {
    clearDocument();
    navigation.replace('Upload');
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Image with AR Overlay */}
        <View style={styles.imageContainer}>
          {cameraMode ? (
            <CameraARView
              components={components}
              selectedComponent={selectedComponent}
              onComponentPress={setSelectedComponent}
              imageDimensions={imageDimensions}
            />
          ) : (
            <View
              {...panResponder.panHandlers}
              style={{
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { scale: zoom },
                ],
              }}
            >
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
                onLoad={handleImageLoad}
              />
              <AROverlay
                components={components}
                connections={connections}
                imageDimensions={imageDimensions}
                selectedComponent={selectedComponent}
                onComponentPress={setSelectedComponent}
                showLabels={showLabels}
              />
            </View>
          )}
        </View>

        {/* Zoom & label controls */}
        {!cameraMode && (
          <View style={styles.zoomControls}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            >
              <Text style={styles.zoomBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
            >
              <Text style={styles.zoomBtnText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            >
              <Text style={[styles.zoomBtnText, { fontSize: 12 }]}>1:1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.zoomBtn, showLabels && styles.zoomBtnActive]}
              onPress={() => setShowLabels((v) => !v)}
            >
              <Text style={[styles.zoomBtnText, { fontSize: 12 }, showLabels && { color: colors.white }]}>Aa</Text>
            </TouchableOpacity>
          </View>
        )

        {/* Camera toggle */}
        <TouchableOpacity
          style={[styles.cameraToggle, cameraMode && styles.cameraToggleActive]}
          onPress={() => setCameraMode((v) => !v)}
        >
          <Text style={[styles.cameraToggleText, cameraMode && { color: colors.white }]}>
            {cameraMode ? '🖼️ Diagram View' : '📷 Camera AR'}
          </Text>
        </TouchableOpacity>

        {/* AI Summary */}
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryTitle}>🤖 AI Summary</Text>
          <Text style={styles.summaryText}>
            {document.ai_summary || 'No summary available'}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{components.length}</Text>
            <Text style={styles.statLabel}>Components</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {document.ar?.relationships?.connections?.length || 0}
            </Text>
            <Text style={styles.statLabel}>Connections</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {document.meta?.width || 0} × {document.meta?.height || 0}
            </Text>
            <Text style={styles.statLabel}>Resolution</Text>
          </View>
        </View>

        {/* Selected Component Info */}
        {selectedComponent && (
          <View style={styles.selectedComponentContainer}>
            <Text style={styles.selectedComponentTitle}>
              📍 Selected Component
            </Text>
            <Text style={styles.selectedComponentLabel}>
              {selectedComponent.label}
            </Text>
            {selectedComponent.description && (
              <Text style={styles.selectedComponentDesc}>
                {selectedComponent.description}
              </Text>
            )}
            <Text style={styles.selectedComponentMeta}>
              Confidence: {(selectedComponent.confidence * 100).toFixed(1)}%
            </Text>
            <TouchableOpacity
              style={styles.deselectButton}
              onPress={() => setSelectedComponent(null)}
            >
              <Text style={styles.deselectButtonText}>Clear Selection</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Components')}
        >
          <Text style={styles.navButtonIcon}>🔍</Text>
          <Text style={styles.navButtonText}>Components</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Chat')}
        >
          <Text style={styles.navButtonIcon}>💬</Text>
          <Text style={styles.navButtonText}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton} onPress={handleNewUpload}>
          <Text style={styles.navButtonIcon}>📤</Text>
          <Text style={styles.navButtonText}>New</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    backgroundColor: colors.white,
    padding: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: SCREEN_WIDTH - spacing.md * 2,
    height: (SCREEN_WIDTH - spacing.md * 2) * 0.75,
  },
  summaryContainer: {
    backgroundColor: colors.white,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  summaryText: {
    ...typography.body,
    color: colors.textLight,
    lineHeight: 22,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.white,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textLight,
  },
  selectedComponentContainer: {
    backgroundColor: colors.primary,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
  },
  selectedComponentTitle: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  selectedComponentLabel: {
    ...typography.h2,
    color: colors.white,
    marginBottom: spacing.xs,
  },
  selectedComponentDesc: {
    ...typography.body,
    color: colors.white,
    opacity: 0.9,
    marginBottom: spacing.sm,
  },
  selectedComponentMeta: {
    ...typography.caption,
    color: colors.white,
    opacity: 0.8,
  },
  deselectButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.white,
    padding: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  deselectButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  navButtonIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  navButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  cameraToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cameraToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cameraToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: 8,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  zoomBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  zoomLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textLight,
    minWidth: 40,
    textAlign: 'center',
  },
});