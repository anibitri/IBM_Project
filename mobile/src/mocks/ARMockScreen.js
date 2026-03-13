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
   Mock data — matches conftest.py System Architecture Diagram
   ────────────────────────────────────────────── */

const MOCK_COMPONENTS = [
  { id: 'comp-1', label: 'CPU',     x: 0.100, y: 0.133, width: 0.250, height: 0.200, confidence: 0.96, center_x: 0.225, center_y: 0.233, color: '#4682B4' },
  { id: 'comp-2', label: 'RAM',     x: 0.425, y: 0.133, width: 0.225, height: 0.133, confidence: 0.93, center_x: 0.538, center_y: 0.200, color: '#3CA050' },
  { id: 'comp-3', label: 'Cache',   x: 0.425, y: 0.300, width: 0.150, height: 0.100, confidence: 0.89, center_x: 0.500, center_y: 0.350, color: '#B4643C' },
  { id: 'comp-4', label: 'CLK',     x: 0.700, y: 0.133, width: 0.175, height: 0.233, confidence: 0.91, center_x: 0.788, center_y: 0.250, color: '#A03CB4' },
  { id: 'comp-5', label: 'Storage', x: 0.100, y: 0.467, width: 0.275, height: 0.167, confidence: 0.94, center_x: 0.238, center_y: 0.550, color: '#C8A028' },
  { id: 'comp-6', label: 'GPU',     x: 0.425, y: 0.467, width: 0.350, height: 0.233, confidence: 0.97, center_x: 0.600, center_y: 0.583, color: '#B43232' },
  { id: 'comp-7', label: 'I/O',     x: 0.100, y: 0.733, width: 0.175, height: 0.133, confidence: 0.87, center_x: 0.188, center_y: 0.800, color: '#50A0A0' },
  { id: 'comp-8', label: 'Network', x: 0.350, y: 0.733, width: 0.250, height: 0.133, confidence: 0.90, center_x: 0.475, center_y: 0.800, color: '#6450B4' },
];

const MOCK_CONNECTIONS = [
  { from: 'comp-1', to: 'comp-2', type: 'bus',       distance: 0.31 },
  { from: 'comp-1', to: 'comp-5', type: 'bus',       distance: 0.32 },
  { from: 'comp-2', to: 'comp-6', type: 'bus',       distance: 0.39 },
  { from: 'comp-2', to: 'comp-3', type: 'data_flow', distance: 0.17 },
  { from: 'comp-1', to: 'comp-3', type: 'data_flow', distance: 0.30 },
  { from: 'comp-4', to: 'comp-1', type: 'signal',    distance: 0.56 },
  { from: 'comp-5', to: 'comp-7', type: 'bus',       distance: 0.25 },
  { from: 'comp-7', to: 'comp-8', type: 'bus',       distance: 0.29 },
  { from: 'comp-6', to: 'comp-8', type: 'data_flow', distance: 0.25 },
];

const MOCK_IMAGE_DIMS = { width: 800, height: 600 };

const DISPLAY_WIDTH  = SCREEN_WIDTH - 32;
const DISPLAY_HEIGHT = DISPLAY_WIDTH * (600 / 800);

/* ──────────────────────────────────────────────
   SVG Placeholder — matching conftest.py test image
   ────────────────────────────────────────────── */

function PlaceholderDiagram({ width, height }) {
  // Grid lines (40px intervals on 800×600)
  const gridV = [];
  for (let gx = 0; gx < 1; gx += 40 / 800) gridV.push(gx);
  const gridH = [];
  for (let gy = 0; gy < 1; gy += 40 / 600) gridH.push(gy);

  return (
    <Svg width={width} height={height}>
      {/* Background */}
      <Rect width={width} height={height} fill="#F0F0F5" rx={4} />

      {/* Grid */}
      {gridV.map((gx, i) => (
        <Line key={`gv-${i}`} x1={gx * width} y1={0} x2={gx * width} y2={height}
          stroke="#DCE1EB" strokeWidth={0.5} />
      ))}
      {gridH.map((gy, i) => (
        <Line key={`gh-${i}`} x1={0} y1={gy * height} x2={width} y2={gy * height}
          stroke="#DCE1EB" strokeWidth={0.5} />
      ))}

      {/* Title bar */}
      <Rect x={0} y={0} width={width} height={height * 0.058} fill="#323246" />
      <SvgText x={width / 2} y={height * 0.038} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
        System Architecture Diagram
      </SvgText>

      {/* Connection lines */}
      {MOCK_CONNECTIONS.map((conn, i) => {
        const from = MOCK_COMPONENTS.find((c) => c.id === conn.from);
        const to   = MOCK_COMPONENTS.find((c) => c.id === conn.to);
        if (!from || !to) return null;
        return (
          <Line key={`cl-${i}`}
            x1={from.center_x * width} y1={from.center_y * height}
            x2={to.center_x * width}   y2={to.center_y * height}
            stroke="#505064" strokeWidth={1.5}
          />
        );
      })}

      {/* Component rectangles */}
      {MOCK_COMPONENTS.map((c) => (
        <G key={c.id}>
          <Rect
            x={c.x * width} y={c.y * height}
            width={c.width * width} height={c.height * height}
            fill={c.color} stroke="#1E1E1E" strokeWidth={2} rx={2}
          />
          <SvgText
            x={c.center_x * width} y={c.center_y * height + 4}
            textAnchor="middle" fill="white" fontSize="10" fontWeight="bold"
          >
            {c.label}
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

  const relatedConnections = selected
    ? MOCK_CONNECTIONS.filter(
        (c) => c.from === selected.id || c.to === selected.id,
      )
    : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>AR Overlay Preview</Text>
      <Text style={styles.subheading}>
        System Architecture — {MOCK_COMPONENTS.length} components detected
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
          <View style={styles.selectedHeader}>
            <View style={[styles.colorDot, { backgroundColor: selected.color }]} />
            <Text style={styles.selectedLabel}>{selected.label}</Text>
            <View style={styles.confPill}>
              <Text style={styles.confPillText}>
                {(selected.confidence * 100).toFixed(0)}%
              </Text>
            </View>
          </View>
          <Text style={styles.selectedMeta}>
            Position: ({selected.x.toFixed(2)}, {selected.y.toFixed(2)})  •  Size: {(selected.width * 100).toFixed(0)}% × {(selected.height * 100).toFixed(0)}%
          </Text>
          {relatedConnections.length > 0 && (
            <Text style={styles.selectedConnections}>
              Connected to:{' '}
              {relatedConnections
                .map((c) => {
                  const other = c.from === selected.id ? c.to : c.from;
                  return MOCK_COMPONENTS.find((m) => m.id === other)?.label || other;
                })
                .join(', ')}
            </Text>
          )}
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
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.xs,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  selectedLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2eaf4',
    flex: 1,
  },
  confPill: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confPillText: {
    color: '#4caf50',
    fontSize: 12,
    fontWeight: '700',
  },
  selectedMeta: {
    fontSize: 12,
    color: '#6b7fa3',
    marginBottom: spacing.xs,
    fontFamily: 'monospace',
  },
  selectedConnections: {
    fontSize: 12,
    color: '#8ab4f8',
    marginBottom: spacing.sm,
    fontStyle: 'italic',
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
