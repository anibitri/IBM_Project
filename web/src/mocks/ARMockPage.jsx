import React, { useState } from 'react';
import ARDiagramViewer from '../components/ARDiagramViewer';

/* ──────────────────────────────────────────────
   Mock data — simulates backend AR response
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

// Placeholder image — a 900×600 SVG diagram rendered as data URI
const MOCK_IMAGE_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
  <rect width="900" height="600" fill="#0f1e36"/>
  <rect x="10" y="10" width="880" height="580" rx="12" fill="none" stroke="#1e3a5f" stroke-width="2"/>
  <text x="450" y="40" text-anchor="middle" fill="#4a90d9" font-size="18" font-family="sans-serif" font-weight="bold">System Architecture Diagram (Mock)</text>

  <!-- API Gateway -->
  <rect x="45" y="60" width="162" height="84" rx="8" fill="#132744" stroke="#4a90d9" stroke-width="1.5"/>
  <text x="126" y="108" text-anchor="middle" fill="#8ab4f8" font-size="14" font-family="sans-serif">API Gateway</text>

  <!-- Auth Service -->
  <rect x="270" y="48" width="144" height="72" rx="8" fill="#132744" stroke="#4a90d9" stroke-width="1.5"/>
  <text x="342" y="90" text-anchor="middle" fill="#8ab4f8" font-size="14" font-family="sans-serif">Auth Service</text>

  <!-- Database -->
  <rect x="495" y="72" width="180" height="96" rx="8" fill="#132744" stroke="#4a90d9" stroke-width="1.5"/>
  <text x="585" y="126" text-anchor="middle" fill="#8ab4f8" font-size="14" font-family="sans-serif">Database</text>

  <!-- Message Queue -->
  <rect x="90" y="240" width="198" height="72" rx="8" fill="#132744" stroke="#63b2ee" stroke-width="1.5"/>
  <text x="189" y="282" text-anchor="middle" fill="#8ab4f8" font-size="14" font-family="sans-serif">Message Queue</text>

  <!-- Worker Service -->
  <rect x="360" y="228" width="162" height="84" rx="8" fill="#132744" stroke="#63b2ee" stroke-width="1.5"/>
  <text x="441" y="276" text-anchor="middle" fill="#8ab4f8" font-size="14" font-family="sans-serif">Worker Service</text>

  <!-- Cache Layer -->
  <rect x="585" y="252" width="144" height="60" rx="8" fill="#132744" stroke="#63b2ee" stroke-width="1.5"/>
  <text x="657" y="288" text-anchor="middle" fill="#8ab4f8" font-size="14" font-family="sans-serif">Cache Layer</text>

  <!-- Load Balancer -->
  <rect x="225" y="390" width="180" height="72" rx="8" fill="#132744" stroke="#FFB74D" stroke-width="1.5"/>
  <text x="315" y="432" text-anchor="middle" fill="#FFB74D" font-size="14" font-family="sans-serif">Load Balancer</text>

  <!-- CDN -->
  <rect x="495" y="408" width="126" height="60" rx="8" fill="#132744" stroke="#FFB74D" stroke-width="1.5"/>
  <text x="558" y="444" text-anchor="middle" fill="#FFB74D" font-size="14" font-family="sans-serif">CDN</text>

  <!-- Connection lines -->
  <line x1="207" y1="108" x2="270" y2="90" stroke="#2e5a88" stroke-width="1.5" stroke-dasharray="5,3"/>
  <line x1="414" y1="90" x2="495" y2="108" stroke="#2e5a88" stroke-width="1.5" stroke-dasharray="5,3"/>
  <line x1="126" y1="144" x2="189" y2="240" stroke="#2e5a88" stroke-width="1.5" stroke-dasharray="5,3"/>
  <line x1="288" y1="276" x2="360" y2="270" stroke="#2e5a88" stroke-width="1.5" stroke-dasharray="5,3"/>
  <line x1="522" y1="276" x2="585" y2="276" stroke="#2e5a88" stroke-width="1.5" stroke-dasharray="5,3"/>
  <line x1="441" y1="312" x2="315" y2="390" stroke="#2e5a88" stroke-width="1.5" stroke-dasharray="5,3"/>
  <line x1="405" y1="432" x2="495" y2="438" stroke="#2e5a88" stroke-width="1.5" stroke-dasharray="5,3"/>
</svg>`);

/* ──────────────────────────────────────────────
   MOCK PAGE COMPONENT
   ────────────────────────────────────────────── */

export default function ARMockPage() {
  const [selected, setSelected] = useState(null);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Web 3D AR Viewer — Mock Preview</h1>
        <p style={styles.subtitle}>
          This is a standalone mock showing what the AR diagram viewer produces.
          Rotate, zoom, and click components in the 3D scene below.
        </p>
      </header>

      <div style={styles.viewerWrapper}>
        <ARDiagramViewer
          imageUrl={MOCK_IMAGE_URL}
          components={MOCK_COMPONENTS}
          connections={MOCK_CONNECTIONS}
          selectedComponent={selected}
          onComponentClick={(comp) =>
            setSelected((prev) => (prev?.id === comp.id ? null : comp))
          }
        />
      </div>

      {/* Selected component detail */}
      <div style={styles.infoBar}>
        {selected ? (
          <div style={styles.selectedCard}>
            <strong>{selected.label}</strong>
            <span style={styles.confidence}>
              {(selected.confidence * 100).toFixed(0)}% confidence
            </span>
            <span style={styles.coords}>
              x:{selected.x.toFixed(2)} y:{selected.y.toFixed(2)} w:{selected.width.toFixed(2)} h:{selected.height.toFixed(2)}
            </span>
            <button style={styles.clearBtn} onClick={() => setSelected(null)}>
              Clear
            </button>
          </div>
        ) : (
          <span style={styles.hint}>Click a component label in the 3D scene to inspect it</span>
        )}
      </div>

      {/* Component list */}
      <div style={styles.componentGrid}>
        {MOCK_COMPONENTS.map((c) => (
          <button
            key={c.id}
            style={{
              ...styles.chip,
              ...(selected?.id === c.id ? styles.chipActive : {}),
            }}
            onClick={() => setSelected((prev) => (prev?.id === c.id ? null : c))}
          >
            {c.label}
            <small style={styles.chipConf}>{(c.confidence * 100).toFixed(0)}%</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ──── Inline styles (self-contained mock) ──── */

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0a1628',
    color: '#c9d6e8',
    fontFamily: "'Inter', system-ui, sans-serif",
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#e2eaf4',
    margin: '0 0 6px',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7fa3',
    maxWidth: 520,
    margin: '0 auto',
    lineHeight: 1.5,
  },
  viewerWrapper: {
    width: '100%',
    maxWidth: 900,
    height: 520,
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid #1e3a5f',
  },
  infoBar: {
    marginTop: 16,
    width: '100%',
    maxWidth: 900,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#4a6a96',
    fontStyle: 'italic',
  },
  selectedCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    background: '#132744',
    padding: '10px 20px',
    borderRadius: 8,
    border: '1px solid #4a90d9',
    fontSize: 14,
  },
  confidence: {
    color: '#63b2ee',
    fontSize: 12,
  },
  coords: {
    color: '#4a6a96',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  clearBtn: {
    background: '#4a90d9',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  componentGrid: {
    marginTop: 16,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    maxWidth: 900,
  },
  chip: {
    background: '#132744',
    color: '#8ab4f8',
    border: '1px solid #1e3a5f',
    borderRadius: 6,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.15s',
  },
  chipActive: {
    background: '#1e3a5f',
    borderColor: '#4a90d9',
    color: '#FFB74D',
  },
  chipConf: {
    color: '#4a6a96',
    fontSize: 10,
  },
};
