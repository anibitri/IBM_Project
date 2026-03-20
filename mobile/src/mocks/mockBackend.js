/**
 * Mock Backend Service
 * Simulates all backend API responses for offline mobile development.
 *
 * Demo data represents the IBM OpenTelemetry → Instana observability pipeline
 * as described in the IBM project brief.
 */

// ─── IBM OpenTelemetry Diagram Components ─────────────────────
// Matches the diagram from the IBM Instana documentation:
// App → (OTLP) → OTel Collector → (OTLP or Instana Exporter) → Instana Agent → Instana

const MOCK_COMPONENTS = [
  {
    id: 'otel-1',
    label: 'App',
    model_label: 'App',
    description: 'Instrumented application using the OpenTelemetry SDK. Emits telemetry data — traces, metrics, and logs — in OTLP format to the OTel Collector for processing.',
    x: 0.04, y: 0.26, width: 0.16, height: 0.38,
    confidence: 0.97, center_x: 0.120, center_y: 0.450,
    color: '#2E86AB',
  },
  {
    id: 'otel-2',
    label: 'OTel Collector',
    model_label: 'OTel Collector',
    description: 'OpenTelemetry Collector — vendor-agnostic telemetry pipeline component. Receives telemetry via OTLP, processes it (filtering, sampling, enrichment), and routes to configured exporters.',
    x: 0.27, y: 0.04, width: 0.37, height: 0.28,
    confidence: 0.96, center_x: 0.455, center_y: 0.180,
    color: '#4A90D9',
  },
  {
    id: 'otel-3',
    label: 'OTLP or Instana Exporter',
    model_label: 'Instana Exporter',
    description: 'Exporter plugin within the OTel Collector. Converts processed telemetry and forwards it to the Instana Agent using either native OTLP or Instana-specific wire format.',
    x: 0.27, y: 0.57, width: 0.31, height: 0.22,
    confidence: 0.93, center_x: 0.425, center_y: 0.680,
    color: '#E07B39',
  },
  {
    id: 'otel-4',
    label: 'Instana Agent',
    model_label: 'Instana Agent',
    description: 'IBM Instana host agent deployed on the monitored infrastructure. Receives telemetry from the exporter and forwards it securely to the Instana SaaS backend for storage and analysis.',
    x: 0.62, y: 0.52, width: 0.19, height: 0.22,
    confidence: 0.95, center_x: 0.715, center_y: 0.630,
    color: '#E8192C',
  },
  {
    id: 'otel-5',
    label: 'Instana',
    model_label: 'Instana',
    description: 'IBM Instana Observability platform. Ingests and stores all telemetry. Provides real-time dashboards, automated anomaly detection, distributed trace visualisation, and alerting.',
    x: 0.86, y: 0.04, width: 0.11, height: 0.90,
    confidence: 0.98, center_x: 0.915, center_y: 0.490,
    color: '#E8192C',
  },
];

const MOCK_CONNECTIONS = [
  {
    from: 'otel-1', to: 'otel-2',
    from_label: 'App', to_label: 'OTel Collector',
    type: 'otlp', distance: 0.34,
    description: 'Application sends telemetry (traces, metrics, logs) via OTLP protocol',
  },
  {
    from: 'otel-2', to: 'otel-3',
    from_label: 'OTel Collector', to_label: 'OTLP or Instana Exporter',
    type: 'internal', distance: 0.50,
    description: 'Collector routes processed telemetry to the configured exporter',
  },
  {
    from: 'otel-3', to: 'otel-4',
    from_label: 'OTLP or Instana Exporter', to_label: 'Instana Agent',
    type: 'otlp', distance: 0.29,
    description: 'Exporter forwards telemetry to the local Instana Agent over OTLP/HTTP',
  },
  {
    from: 'otel-4', to: 'otel-5',
    from_label: 'Instana Agent', to_label: 'Instana',
    type: 'https', distance: 0.21,
    description: 'Instana Agent securely transmits all telemetry to the Instana SaaS backend',
  },
];

const MOCK_AI_SUMMARY =
  'This is the IBM OpenTelemetry to Instana observability pipeline. It shows how application telemetry data ' +
  '(traces, metrics, and logs) flows from an OpenTelemetry-instrumented App, through the OTel Collector, ' +
  'via the OTLP or Instana Exporter, through the Instana Agent, and into the IBM Instana Observability ' +
  'platform for real-time monitoring and analysis. The OTel Collector acts as a vendor-agnostic telemetry ' +
  'pipeline hub, enabling flexible routing without vendor lock-in. IBM Granite AI powers the analysis.';

const MOCK_VISION = {
  description: 'IBM OpenTelemetry observability pipeline diagram showing App, OTel Collector, OTLP/Instana Exporter, Instana Agent, and Instana platform with OTLP data flow arrows.',
  diagram_type: 'observability_architecture',
  detected_elements: [
    'App box on the left emitting OTLP telemetry',
    'OTel Collector as central processing hub',
    'OTLP or Instana Exporter routing telemetry',
    'Instana Agent forwarding to SaaS backend',
    'Instana platform receiving all observability data',
  ],
};

// ─── AI Chat Responses — IBM OTel specific ────────────────────

const CHAT_RESPONSES = {
  components:
    'This diagram shows **5 components** of the IBM OpenTelemetry observability pipeline:\n\n' +
    '1. **App** — Your instrumented application using the OpenTelemetry SDK\n' +
    '2. **OTel Collector** — Vendor-agnostic telemetry pipeline (receives, processes, routes)\n' +
    '3. **OTLP or Instana Exporter** — Exports telemetry to the Instana backend\n' +
    '4. **Instana Agent** — Host agent that forwards data to Instana SaaS\n' +
    '5. **Instana** — IBM Instana Observability platform for monitoring and analysis',

  flow:
    'Telemetry data flows through the pipeline as follows:\n\n' +
    '1. **App → OTel Collector**: Application sends traces, metrics, and logs via OTLP protocol\n' +
    '2. **OTel Collector → Exporter**: Collector processes and routes data to the Instana Exporter\n' +
    '3. **Exporter → Instana Agent**: Telemetry forwarded via OTLP/HTTP to the local Instana Agent\n' +
    '4. **Instana Agent → Instana**: Agent transmits data securely to the IBM Instana SaaS backend',

  otelCollector:
    '**OTel Collector** is the central component of this pipeline.\n\n' +
    'It is a vendor-agnostic service that:\n' +
    '• **Receives** telemetry from your app via OTLP\n' +
    '• **Processes** data — filtering, sampling, attribute enrichment\n' +
    '• **Routes** to one or more exporters (Instana, Jaeger, Prometheus, etc.)\n\n' +
    'Using a Collector means your application is not locked to any single observability vendor.',

  instana:
    '**IBM Instana** is an enterprise-grade Application Performance Monitoring (APM) and ' +
    'observability platform.\n\n' +
    'It provides:\n' +
    '• Real-time distributed trace visualisation\n' +
    '• Automated anomaly detection with AI\n' +
    '• Infrastructure and application metrics dashboards\n' +
    '• Alerting and incident management\n' +
    '• Full-stack observability from infrastructure to code',

  otlp:
    '**OTLP** (OpenTelemetry Protocol) is the standard wire protocol for transmitting telemetry data.\n\n' +
    'It supports three telemetry signals:\n' +
    '• **Traces** — end-to-end request journeys across services\n' +
    '• **Metrics** — numerical measurements over time (latency, throughput, errors)\n' +
    '• **Logs** — structured event records\n\n' +
    'OTLP runs over gRPC or HTTP/protobuf and is vendor-neutral.',

  purpose:
    'This diagram shows the **IBM OpenTelemetry observability pipeline** — a solution for monitoring ' +
    'applications without modifying the core documentation.\n\n' +
    'The goal is to instrument your application once with the OpenTelemetry SDK, then route all ' +
    'telemetry through a flexible Collector pipeline into IBM Instana for deep observability. ' +
    'This approach keeps the application code vendor-neutral while gaining full Instana monitoring capabilities.',

  default:
    'This diagram represents the IBM OpenTelemetry to Instana observability pipeline. ' +
    'An instrumented application sends telemetry (traces, metrics, logs) via OTLP to the OTel Collector, ' +
    'which processes and routes the data through the Instana Exporter to the Instana Agent, and finally ' +
    'into the IBM Instana platform for real-time monitoring, anomaly detection, and distributed tracing.',
};

function getAIResponse(query) {
  const q = query.toLowerCase();

  if (q.includes('component') || q.includes('show') || q.includes('list') || q.includes('what is in')) {
    return CHAT_RESPONSES.components;
  }
  if (q.includes('flow') || q.includes('how does') || q.includes('path') || q.includes('travel') || q.includes('send') || q.includes('route')) {
    return CHAT_RESPONSES.flow;
  }
  if (q.includes('collector') || q.includes('otel collector')) {
    return CHAT_RESPONSES.otelCollector;
  }
  if (q.includes('instana') && !q.includes('exporter') && !q.includes('agent')) {
    return CHAT_RESPONSES.instana;
  }
  if (q.includes('otlp') || q.includes('protocol') || q.includes('opentelemetry')) {
    return CHAT_RESPONSES.otlp;
  }
  if (q.includes('purpose') || q.includes('goal') || q.includes('why') || q.includes('what does')) {
    return CHAT_RESPONSES.purpose;
  }

  // Component-specific queries
  for (const comp of MOCK_COMPONENTS) {
    if (q.includes(comp.label.toLowerCase())) {
      return `**${comp.label}**\n\n${comp.description}`;
    }
  }

  return CHAT_RESPONSES.default;
}

// ─── Generic PDF microservices mock (for uploaded PDFs) ───────

const MOCK_PDF_COMPONENTS = [
  {
    id: 'pdf-1',
    label: 'API Gateway',
    model_label: 'API Gateway',
    description: 'Entry point for all client requests. Handles routing, rate limiting, authentication, and load balancing across backend micro-services.',
    x: 0.350, y: 0.080, width: 0.300, height: 0.120,
    confidence: 0.95, center_x: 0.500, center_y: 0.140,
    color: '#2196F3',
  },
  {
    id: 'pdf-2',
    label: 'Auth Service',
    model_label: 'Auth Service',
    description: 'Manages user authentication and authorization using JWT tokens and OAuth 2.0 flows.',
    x: 0.050, y: 0.280, width: 0.250, height: 0.130,
    confidence: 0.92, center_x: 0.175, center_y: 0.345,
    color: '#4CAF50',
  },
  {
    id: 'pdf-3',
    label: 'User Service',
    model_label: 'User Service',
    description: 'CRUD operations on user profiles, preferences, and account settings. Stores data in PostgreSQL.',
    x: 0.370, y: 0.280, width: 0.250, height: 0.130,
    confidence: 0.91, center_x: 0.495, center_y: 0.345,
    color: '#FF9800',
  },
  {
    id: 'pdf-4',
    label: 'Data Service',
    model_label: 'Data Service',
    description: 'Handles data ingestion, transformation, and retrieval. Supports batch and streaming pipelines.',
    x: 0.690, y: 0.280, width: 0.260, height: 0.130,
    confidence: 0.93, center_x: 0.820, center_y: 0.345,
    color: '#9C27B0',
  },
  {
    id: 'pdf-5',
    label: 'PostgreSQL',
    model_label: 'PostgreSQL',
    description: 'Primary relational database storing user data, metadata, and transactional records.',
    x: 0.050, y: 0.500, width: 0.200, height: 0.110,
    confidence: 0.90, center_x: 0.150, center_y: 0.555,
    color: '#336791',
  },
  {
    id: 'pdf-6',
    label: 'Redis Cache',
    model_label: 'Redis Cache',
    description: 'In-memory cache layer for session tokens, frequently accessed queries, and rate-limit counters.',
    x: 0.310, y: 0.500, width: 0.200, height: 0.110,
    confidence: 0.88, center_x: 0.410, center_y: 0.555,
    color: '#D32F2F',
  },
  {
    id: 'pdf-7',
    label: 'Message Queue',
    model_label: 'Message Queue',
    description: 'Asynchronous message broker (Kafka/RabbitMQ) for decoupled event-driven communication.',
    x: 0.570, y: 0.500, width: 0.220, height: 0.110,
    confidence: 0.89, center_x: 0.680, center_y: 0.555,
    color: '#FF5722',
  },
  {
    id: 'pdf-8',
    label: 'Object Storage',
    model_label: 'Object Storage',
    description: 'S3-compatible blob store for documents, images, and large binary artefacts.',
    x: 0.310, y: 0.700, width: 0.380, height: 0.120,
    confidence: 0.94, center_x: 0.500, center_y: 0.760,
    color: '#607D8B',
  },
];

const MOCK_PDF_CONNECTIONS = [
  { from: 'pdf-1', to: 'pdf-2', from_label: 'API Gateway', to_label: 'Auth Service', type: 'http', distance: 0.30 },
  { from: 'pdf-1', to: 'pdf-3', from_label: 'API Gateway', to_label: 'User Service', type: 'http', distance: 0.22 },
  { from: 'pdf-1', to: 'pdf-4', from_label: 'API Gateway', to_label: 'Data Service', type: 'http', distance: 0.35 },
  { from: 'pdf-2', to: 'pdf-5', from_label: 'Auth Service', to_label: 'PostgreSQL', type: 'tcp', distance: 0.22 },
  { from: 'pdf-3', to: 'pdf-5', from_label: 'User Service', to_label: 'PostgreSQL', type: 'tcp', distance: 0.28 },
  { from: 'pdf-2', to: 'pdf-6', from_label: 'Auth Service', to_label: 'Redis Cache', type: 'tcp', distance: 0.25 },
  { from: 'pdf-4', to: 'pdf-7', from_label: 'Data Service', to_label: 'Message Queue', type: 'amqp', distance: 0.20 },
  { from: 'pdf-3', to: 'pdf-8', from_label: 'User Service', to_label: 'Object Storage', type: 'http', distance: 0.42 },
  { from: 'pdf-4', to: 'pdf-8', from_label: 'Data Service', to_label: 'Object Storage', type: 'http', distance: 0.35 },
];

const MOCK_PDF_AI_SUMMARY =
  'This is a Micro-services Architecture Diagram. An API Gateway routes traffic to three backend services: ' +
  'Auth Service, User Service, and Data Service. These connect to a PostgreSQL database, Redis cache, ' +
  'a message queue, and object storage. The architecture follows cloud-native best practices with ' +
  'stateless services, centralised authentication, and event-driven data pipelines.';

const MOCK_PDF_VISION = {
  description: 'A micro-services architecture diagram showing API Gateway, Auth/User/Data services, PostgreSQL, Redis, message queue, and object storage.',
  diagram_type: 'software_architecture',
  detected_elements: [
    'Rounded rectangles representing micro-services',
    'Arrows indicating HTTP and TCP connections',
    'Database and storage symbols',
  ],
};

// ─── Simulated delay ─────────────────────────────────────────

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Mock Backend API ────────────────────────────────────────

export const mockBackend = {
  uploadFile: async (file) => {
    await delay(800);
    const isPdf = (file.type || '').includes('pdf') || (file.name || '').endsWith('.pdf');
    const storedName = isPdf
      ? `mock_${Date.now()}.pdf`
      : `mock_${Date.now()}.png`;
    return {
      status: 'success',
      file: {
        original_name: file.name || (isPdf ? 'document.pdf' : 'diagram.png'),
        stored_name: storedName,
        type: file.type || (isPdf ? 'application/pdf' : 'image/png'),
        size: isPdf ? 1480000 : 245000,
        url: file.uri || null,
      },
    };
  },

  processDocument: async (storedName, _extractAR = true, _generateAI = true) => {
    await delay(2000);
    const isPdf = (storedName || '').endsWith('.pdf');

    if (isPdf) {
      return {
        status: 'success',
        ar: {
          components: MOCK_PDF_COMPONENTS,
          componentCount: MOCK_PDF_COMPONENTS.length,
          relationships: { connections: MOCK_PDF_CONNECTIONS },
        },
        vision: MOCK_PDF_VISION,
        ai_summary: MOCK_PDF_AI_SUMMARY,
        text_excerpt: 'Micro-services Architecture — API Gateway, Auth Service, User Service, Data Service, PostgreSQL, Redis Cache, Message Queue, Object Storage.',
        meta: { width: 1000, height: 800, pages: 3, format: 'pdf' },
      };
    }

    // Default demo: IBM OpenTelemetry diagram
    return {
      status: 'success',
      ar: {
        components: MOCK_COMPONENTS,
        componentCount: MOCK_COMPONENTS.length,
        relationships: { connections: MOCK_CONNECTIONS },
      },
      vision: MOCK_VISION,
      ai_summary: MOCK_AI_SUMMARY,
      text_excerpt: 'IBM OpenTelemetry to Instana observability pipeline — App, OTel Collector, OTLP or Instana Exporter, Instana Agent, Instana platform.',
      meta: { width: 900, height: 600, pages: 1, format: 'png' },
    };
  },

  analyzeVision: async (_storedName, _task = 'general_analysis') => {
    await delay(1200);
    return { status: 'success', ...MOCK_VISION };
  },

  generateAR: async (_storedName) => {
    await delay(1500);
    return {
      status: 'success',
      components: MOCK_COMPONENTS,
      relationships: { connections: MOCK_CONNECTIONS },
    };
  },

  askQuestion: async (query, _context, _history = []) => {
    await delay(900);
    return { status: 'success', answer: getAIResponse(query) };
  },

  health: async () => {
    return { status: 'healthy', mock: true };
  },
};

export {
  MOCK_COMPONENTS, MOCK_CONNECTIONS, MOCK_AI_SUMMARY, MOCK_VISION,
  MOCK_PDF_COMPONENTS, MOCK_PDF_CONNECTIONS, MOCK_PDF_AI_SUMMARY, MOCK_PDF_VISION,
};
