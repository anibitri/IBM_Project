import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Svg, { Rect, Line, G, Text as SvgText } from 'react-native-svg';
import AROverlay from '../components/AROverlay';
import { colors, spacing, typography } from '../styles/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ──────────────────────────────────────────────
   Mock data — same components backend would return
   ────────────────────────────────────────────── */

const MOCK_COMPONENTS = [
  {
    id: 'comp-1',
    label: 'API Gateway',
    x: 0.05,
    y: 0.10,
    width: 0.18,
    height: 0.14,
    confidence: 0.95,
    center_x: 0.14,
    center_y: 0.17,
  },
  {
    id: 'comp-2',
    label: 'Auth Service',
    x: 0.30,
    y: 0.08,
    width: 0.16,
    height: 0.12,
    confidence: 0.91,
    center_x: 0.38,
    center_y: 0.14,
  },
  {
    id: 'comp-3',
    label: 'Database',
    x: 0.55,
    y: 0.12,
    width: 0.20,
    height: 0.16,
    confidence: 0.88,
    center_x: 0.65,
    center_y: 0.20,
  },
  {
    id: 'comp-4',
    label: 'Message Queue',
    x: 0.10,
    y: 0.40,
    width: 0.22,
    height: 0.12,
    confidence: 0.85,
    center_x: 0.21,
    center_y: 0.46,
  },
  {
    id: 'comp-5',
    label: 'Worker Service',
    x: 0.40,
    y: 0.38,
    width: 0.18,
    height: 0.14,
    confidence: 0.82,
    center_x: 0.49,
    center_y: 0.45,
  },
  {
    id: 'comp-6',
    label: 'Cache Layer',
    x: 0.65,
    y: 0.42,
    width: 0.16,
    height: 0.10,
    confidence: 0.79,
    center_x: 0.73,
    center_y: 0.47,
  },
  {
    id: 'comp-7',
    label: 'Load Balancer',
    x: 0.25,
    y: 0.65,
    width: 0.20,
    height: 0.12,
    confidence: 0.93,
    center_x: 0.35,
    center_y: 0.71,
  },
  {
    id: 'comp-8',
    label: 'CDN',
    x: 0.55,
    y: 0.68,
    width: 0.14,
    height: 0.10,
    confidence: 0.76,
    center_x: 0.62,
    center_y: 0.73,
  },
];

const MOCK_CONNECTIONS = [
  { from: 'comp-1', to: 'comp-2', type: 'vision', distance: 0.22 },
  { from: 'comp-2', to: 'comp-3', type: 'vision', distance: 0.28 },
  { from: 'comp-1', to: 'comp-4', type: 'proximity', distance: 0.30 },
  { from: 'comp-4', to: 'comp-5', type: 'vision', distance: 0.31 },
  { from: 'comp-5', to: 'comp-6', type: 'proximity', distance: 0.25 },
  { from: 'comp-5', to: 'comp-7', type: 'vision', distance: 0.30 },
  { from: 'comp-7', to: 'comp-8', type: 'proximity', distance: 0.30 },
];

// Simulated image dimensions (backend returns these)
const MOCK_IMAGE_DIMS = { width: 900, height: 600 };

const DISPLAY_WIDTH = SCREEN_WIDTH - 32;
const DISPLAY_HEIGHT = DISPLAY_WIDTH * (600 / 900);

/* ──────────────────────────────────────────────
   SVG Placeholder Diagram
   ────────────────────────────────────────────── */

function PlaceholderDiagram({ width, height }) {
  const boxes = [
    { x: 0.05, y: 0.10, w: 0.18, h: 0.14, label: 'API Gateway', color: '#4a90d9' },
    { x: 0.30, y: 0.08, w: 0.16, h: 0.12, label: 'Auth Service', color: '#4a90d9' },
    { x: 0.55, y: 0.12, w: 0.20, h: 0.16, label: 'Database', color: '#4a90d9' },
    { x: 0.10, y: 0.40, w: 0.22, h: 0.12, label: 'Message Queue', color: '#63b2ee' },
    { x: 0.40, y: 0.38, w: 0.18, h: 0.14, label: 'Worker Service', color: '#63b2ee' },
    { x: 0.65, y: 0.42, w: 0.16, h: 0.10, label: 'Cache Layer', color: '#63b2ee' },
    { x: 0.25, y: 0.65, w: 0.20, h: 0.12, label: 'Load Balancer', color: '#FFB74D' },
    { x: 0.55, y: 0.68, w: 0.14, h: 0.10, label: 'CDN', color: '#FFB74D' },
  ];

  const connections = [
    [0.23, 0.17, 0.30, 0.14],
    [0.46, 0.14, 0.55, 0.18],
    [0.14, 0.24, 0.21, 0.40],
    [0.32, 0.46, 0.40, 0.44],
    [0.58, 0.46, 0.65, 0.46],
    [0.49, 0.52, 0.35, 0.65],
    [0.45, 0.71, 0.55, 0.73],
  ];

  return (
    <Svg width={width} height={height}>
      <Rect width={width} height={height} fill="#0f1e36" rx={8} />
      <SvgText x={width / 2} y={25} textAnchor="middle" fill="#4a90d9" fontSize="12" fontWeight="bold">
        System Architecture (Mock)
      </SvgText>

      {connections.map((c, i) => (
        <Line
          key={`line-${i}`}
          x1={c[0] * width}
          y1={c[1] * height}
          x2={c[2] * width}
          y2={c[3] * height}
          stroke="#1e3a5f"
          strokeWidth={1.5}
          strokeDasharray="4,3"
        />
      ))}

      {boxes.map((b, i) => (
        <G key={`box-${i}`}>
          <Rect
            x={b.x * width}
            y={b.y * height}
            width={b.w * width}
            height={b.h * height}
            rx={6}
            fill="#132744"
            stroke={b.color}
            strokeWidth={1.2}
          />
          <SvgText
            x={(b.x + b.w / 2) * width}
            y={(b.y + b.h / 2) * height + 4}
            textAnchor="middle"
            fill="#8ab4f8"
            fontSize="10"
          >
            {b.label}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   MOCK SCREEN
   ────────────────────────────────────────────── */

export default function ARMockScreen() {
  const [selected, setSelected] = useState(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Mobile AR Overlay — Mock</Text>
      <Text style={styles.subheading}>
        Tap bounding boxes to select components
      </Text>

      {/* Diagram + AR Overlay */}
      <View style={styles.diagramWrapper}>
        <PlaceholderDiagram width={DISPLAY_WIDTH} height={DISPLAY_HEIGHT} />
        <AROverlay
          components={MOCK_COMPONENTS}
          connections={MOCK_CONNECTIONS}
          imageDimensions={MOCK_IMAGE_DIMS}
          selectedComponent={selected}
          onComponentPress={(comp) =>
            setSelected((prev) => (prev?.id === comp.id ? null : comp))
          }
        />
      </View>

      {/* Selected detail */}
      {selected && (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedLabel}>{selected.label}</Text>
          <Text style={styles.selectedMeta}>
            Confidence: {(selected.confidence * 100).toFixed(0)}%{'  '}
            Position: ({selected.x.toFixed(2)}, {selected.y.toFixed(2)})
          </Text>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSelected(null)}
          >
            <Text style={styles.clearButtonText}>Clear Selection</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Component chips */}
      <View style={styles.chipRow}>
        {MOCK_COMPONENTS.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[
              styles.chip,
              selected?.id === c.id && styles.chipActive,
            ]}
            onPress={() =>
              setSelected((prev) => (prev?.id === c.id ? null : c))
            }
          >
            <Text
              style={[
                styles.chipText,
                selected?.id === c.id && styles.chipTextActive,
              ]}
            >
              {c.label}
            </Text>
            <Text style={styles.chipConf}>
              {(c.confidence * 100).toFixed(0)}%
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.footer}>
        {MOCK_COMPONENTS.length} components detected (mock data)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  content: {
    alignItems: 'center',
    padding: spacing.md,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e2eaf4',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  subheading: {
    fontSize: 13,
    color: '#6b7fa3',
    marginBottom: spacing.md,
  },
  diagramWrapper: {
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    position: 'relative',
  },
  selectedCard: {
    width: DISPLAY_WIDTH,
    marginTop: spacing.md,
    backgroundColor: '#132744',
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#4a90d9',
  },
  selectedLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2eaf4',
    marginBottom: spacing.xs,
  },
  selectedMeta: {
    fontSize: 12,
    color: '#6b7fa3',
    marginBottom: spacing.sm,
    fontFamily: 'monospace',
  },
  clearButton: {
    backgroundColor: '#4a90d9',
    padding: spacing.sm,
    borderRadius: 6,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
    width: DISPLAY_WIDTH,
  },
  chip: {
    backgroundColor: '#132744',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: {
    backgroundColor: '#1e3a5f',
    borderColor: '#4a90d9',
  },
  chipText: {
    color: '#8ab4f8',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFB74D',
  },
  chipConf: {
    color: '#4a6a96',
    fontSize: 10,
  },
  footer: {
    marginTop: spacing.lg,
    fontSize: 12,
    color: '#4a6a96',
    fontStyle: 'italic',
  },
});
