/**
 * Mock Backend Service
 * Simulates all backend API responses for offline mobile development.
 * Components match the test System Architecture Diagram from conftest.py.
 */

// ─── Mock Data — System Architecture Diagram ─────────────────
// Coordinates derived from the 800×600 test diagram in conftest.py

const MOCK_COMPONENTS = [
  {
    id: 'comp-1',
    label: 'CPU',
    description: 'Central Processing Unit — primary compute component responsible for executing instructions. Connected to RAM for data access and Storage for persistent I/O.',
    x: 0.100, y: 0.133, width: 0.250, height: 0.200,
    confidence: 0.96, center_x: 0.225, center_y: 0.233,
    color: '#4682B4',
  },
  {
    id: 'comp-2',
    label: 'RAM',
    description: 'Random Access Memory — volatile high-speed memory for active data and program instructions. Directly connected to the CPU via the memory bus.',
    x: 0.425, y: 0.133, width: 0.225, height: 0.133,
    confidence: 0.93, center_x: 0.538, center_y: 0.200,
    color: '#3CA050',
  },
  {
    id: 'comp-3',
    label: 'Cache',
    description: 'CPU Cache — small, fast memory layer between CPU and RAM that stores frequently accessed data to reduce latency.',
    x: 0.425, y: 0.300, width: 0.150, height: 0.100,
    confidence: 0.89, center_x: 0.500, center_y: 0.350,
    color: '#B4643C',
  },
  {
    id: 'comp-4',
    label: 'CLK',
    description: 'System Clock — generates timing signals that synchronize all components. Controls the operational frequency of the CPU and memory bus.',
    x: 0.700, y: 0.133, width: 0.175, height: 0.233,
    confidence: 0.91, center_x: 0.788, center_y: 0.250,
    color: '#A03CB4',
  },
  {
    id: 'comp-5',
    label: 'Storage',
    description: 'Persistent storage (SSD/HDD) for long-term data retention. Connected to the CPU through the I/O controller for read/write operations.',
    x: 0.100, y: 0.467, width: 0.275, height: 0.167,
    confidence: 0.94, center_x: 0.238, center_y: 0.550,
    color: '#C8A028',
  },
  {
    id: 'comp-6',
    label: 'GPU',
    description: 'Graphics Processing Unit — parallel compute architecture optimised for matrix operations, rendering, and machine learning workloads.',
    x: 0.425, y: 0.467, width: 0.350, height: 0.233,
    confidence: 0.97, center_x: 0.600, center_y: 0.583,
    color: '#B43232',
  },
  {
    id: 'comp-7',
    label: 'I/O',
    description: 'Input/Output controller — manages communication between the CPU and peripheral devices such as keyboard, mouse, and external interfaces.',
    x: 0.100, y: 0.733, width: 0.175, height: 0.133,
    confidence: 0.87, center_x: 0.188, center_y: 0.800,
    color: '#50A0A0',
  },
  {
    id: 'comp-8',
    label: 'Network',
    description: 'Network Interface Controller — handles Ethernet/Wi-Fi communication, packet routing, and network protocol processing.',
    x: 0.350, y: 0.733, width: 0.250, height: 0.133,
    confidence: 0.90, center_x: 0.475, center_y: 0.800,
    color: '#6450B4',
  },
];

const MOCK_CONNECTIONS = [
  { from: 'comp-1', to: 'comp-2', from_label: 'CPU', to_label: 'RAM', type: 'bus', distance: 0.31 },
  { from: 'comp-1', to: 'comp-5', from_label: 'CPU', to_label: 'Storage', type: 'bus', distance: 0.32 },
  { from: 'comp-2', to: 'comp-6', from_label: 'RAM', to_label: 'GPU', type: 'bus', distance: 0.39 },
  { from: 'comp-2', to: 'comp-3', from_label: 'RAM', to_label: 'Cache', type: 'data_flow', distance: 0.17 },
  { from: 'comp-1', to: 'comp-3', from_label: 'CPU', to_label: 'Cache', type: 'data_flow', distance: 0.30 },
  { from: 'comp-4', to: 'comp-1', from_label: 'CLK', to_label: 'CPU', type: 'signal', distance: 0.56 },
  { from: 'comp-5', to: 'comp-7', from_label: 'Storage', to_label: 'I/O', type: 'bus', distance: 0.25 },
  { from: 'comp-7', to: 'comp-8', from_label: 'I/O', to_label: 'Network', type: 'bus', distance: 0.29 },
  { from: 'comp-6', to: 'comp-8', from_label: 'GPU', to_label: 'Network', type: 'data_flow', distance: 0.25 },
];

const MOCK_AI_SUMMARY =
  'This is a System Architecture Diagram showing the internal hardware components of a computer system. ' +
  'The CPU is the central compute unit connected to RAM for volatile memory access and Cache for fast data retrieval. ' +
  'A system Clock (CLK) synchronises operations across components. The GPU handles parallel workloads and graphics rendering. ' +
  'Storage provides persistent data, while I/O and Network controllers manage external communication. ' +
  'Components are connected via data buses and signal lines following a standard von Neumann architecture.';

const MOCK_VISION = {
  description: 'A system architecture diagram illustrating hardware components (CPU, RAM, Cache, CLK, Storage, GPU, I/O, Network) with data bus connections and signal flow lines.',
  diagram_type: 'hardware_architecture',
  detected_elements: [
    'Coloured rectangular blocks representing hardware components',
    'Connection lines indicating data buses and signal paths',
    'Title bar labelled "System Architecture Diagram"',
    'Grid-pattern background',
  ],
};

// ─── AI Chat Responses ───────────────────────────────────────

const CHAT_RESPONSES = {
  components: 'This diagram shows **8 hardware components**:\n\n' +
    '1. **CPU** — Central Processing Unit, main compute core\n' +
    '2. **RAM** — Random Access Memory, volatile storage\n' +
    '3. **Cache** — Fast intermediate memory layer\n' +
    '4. **CLK** — System Clock, synchronisation signal\n' +
    '5. **Storage** — Persistent data (SSD/HDD)\n' +
    '6. **GPU** — Graphics/parallel processing unit\n' +
    '7. **I/O** — Input/Output controller\n' +
    '8. **Network** — Network Interface Controller',

  connections: 'The components are connected through data buses and signal lines:\n\n' +
    '• **CPU → RAM**: Memory bus for data read/write\n' +
    '• **CPU → Cache**: High-speed cache bus\n' +
    '• **RAM → Cache**: Cache coherency path\n' +
    '• **CLK → CPU**: Clock signal for synchronisation\n' +
    '• **CPU → Storage**: I/O bus for persistent data\n' +
    '• **RAM → GPU**: PCIe/memory bus for parallel compute\n' +
    '• **Storage → I/O**: Peripheral data path\n' +
    '• **I/O → Network**: External network communication\n' +
    '• **GPU → Network**: Direct network access for distributed workloads',

  purpose: 'This is a **System Architecture Diagram** illustrating the internal hardware layout of a computer system. ' +
    'It follows a von Neumann architecture where the CPU is the central compute element connected to volatile memory (RAM) ' +
    'and persistent storage. The Cache provides fast data access to reduce CPU wait times. A system Clock (CLK) synchronises ' +
    'all operations. The GPU provides parallel processing capability, while I/O and Network controllers handle external communication.',

  default: 'Based on the diagram analysis, this is a standard computer hardware architecture. ' +
    'The CPU sits at the centre connected to RAM and Cache for memory operations, with a Clock for timing. ' +
    'Storage provides persistence, the GPU handles parallel/graphics workloads, and I/O plus Network manage external interfaces. ' +
    'The layout follows conventional computer architecture principles with clear data flow paths between components.',
};

function getAIResponse(query) {
  const q = query.toLowerCase();
  if (q.includes('component') && (q.includes('what') || q.includes('show') || q.includes('list'))) {
    return CHAT_RESPONSES.components;
  }
  if (q.includes('connect') || q.includes('relationship') || q.includes('linked') || q.includes('interact')) {
    return CHAT_RESPONSES.connections;
  }
  if (q.includes('purpose') || q.includes('goal') || q.includes('why') || q.includes('function')) {
    return CHAT_RESPONSES.purpose;
  }

  // Component-specific queries
  for (const comp of MOCK_COMPONENTS) {
    if (q.includes(comp.label.toLowerCase())) {
      return `**${comp.label}**\n\n${comp.description}\n\n` +
        `It has a detection confidence of ${(comp.confidence * 100).toFixed(0)}% ` +
        `and is positioned at (${comp.x.toFixed(2)}, ${comp.y.toFixed(2)}) in the diagram.`;
    }
  }

  return CHAT_RESPONSES.default;
}

// ─── Simulated delay ─────────────────────────────────────────

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── PDF Mock Data ───────────────────────────────────────────

const MOCK_PDF_COMPONENTS = [
  {
    id: 'pdf-1',
    label: 'API Gateway',
    description: 'Entry point for all client requests. Handles routing, rate limiting, authentication, and load balancing across backend micro-services.',
    x: 0.350, y: 0.080, width: 0.300, height: 0.120,
    confidence: 0.95, center_x: 0.500, center_y: 0.140,
    color: '#2196F3',
  },
  {
    id: 'pdf-2',
    label: 'Auth Service',
    description: 'Manages user authentication and authorization using JWT tokens and OAuth 2.0 flows. Issues and validates access tokens.',
    x: 0.050, y: 0.280, width: 0.250, height: 0.130,
    confidence: 0.92, center_x: 0.175, center_y: 0.345,
    color: '#4CAF50',
  },
  {
    id: 'pdf-3',
    label: 'User Service',
    description: 'CRUD operations on user profiles, preferences, and account settings. Stores data in PostgreSQL.',
    x: 0.370, y: 0.280, width: 0.250, height: 0.130,
    confidence: 0.91, center_x: 0.495, center_y: 0.345,
    color: '#FF9800',
  },
  {
    id: 'pdf-4',
    label: 'Data Service',
    description: 'Handles data ingestion, transformation, and retrieval. Supports batch and streaming pipelines for real-time analytics.',
    x: 0.690, y: 0.280, width: 0.260, height: 0.130,
    confidence: 0.93, center_x: 0.820, center_y: 0.345,
    color: '#9C27B0',
  },
  {
    id: 'pdf-5',
    label: 'PostgreSQL',
    description: 'Primary relational database storing user data, metadata, and transactional records.',
    x: 0.050, y: 0.500, width: 0.200, height: 0.110,
    confidence: 0.90, center_x: 0.150, center_y: 0.555,
    color: '#336791',
  },
  {
    id: 'pdf-6',
    label: 'Redis Cache',
    description: 'In-memory cache layer for session tokens, frequently accessed queries, and rate-limit counters.',
    x: 0.310, y: 0.500, width: 0.200, height: 0.110,
    confidence: 0.88, center_x: 0.410, center_y: 0.555,
    color: '#D32F2F',
  },
  {
    id: 'pdf-7',
    label: 'Message Queue',
    description: 'Asynchronous message broker (RabbitMQ/Kafka) for decoupled event-driven communication between services.',
    x: 0.570, y: 0.500, width: 0.220, height: 0.110,
    confidence: 0.89, center_x: 0.680, center_y: 0.555,
    color: '#FF5722',
  },
  {
    id: 'pdf-8',
    label: 'Object Storage',
    description: 'S3-compatible blob store for documents, images, and large binary artefacts uploaded by users.',
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
  'This is a Micro-services Architecture Diagram extracted from a multi-page PDF document. ' +
  'Page 1 contains the high-level overview showing an API Gateway routing traffic to three backend services: ' +
  'Auth Service, User Service, and Data Service. These connect to a PostgreSQL database, Redis cache, ' +
  'a message queue, and object storage. The architecture follows cloud-native best practices with ' +
  'stateless services, centralised authentication, and event-driven data pipelines.';

const MOCK_PDF_VISION = {
  description: 'A micro-services architecture diagram showing API Gateway, Auth/User/Data services, PostgreSQL, Redis, message queue, and object storage.',
  diagram_type: 'software_architecture',
  detected_elements: [
    'Rounded rectangles representing micro-services',
    'Arrows indicating HTTP and TCP connections',
    'Database cylinder icons',
    'Cloud storage symbol',
    'Title and legend on page header',
  ],
};

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

  processDocument: async (storedName, extractAR = true, generateAI = true) => {
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
        text_excerpt: 'Micro-services Architecture Diagram — API Gateway, Auth Service, User Service, Data Service, PostgreSQL, Redis Cache, Message Queue, Object Storage.',
        meta: { width: 1000, height: 800, pages: 3, format: 'pdf' },
      };
    }

    return {
      status: 'success',
      ar: {
        components: MOCK_COMPONENTS,
        componentCount: MOCK_COMPONENTS.length,
        relationships: { connections: MOCK_CONNECTIONS },
      },
      vision: MOCK_VISION,
      ai_summary: MOCK_AI_SUMMARY,
      text_excerpt: 'System Architecture Diagram — showing CPU, RAM, Cache, CLK, Storage, GPU, I/O, and Network hardware components with data bus connections.',
      meta: { width: 800, height: 600, pages: 1, format: 'png' },
    };
  },

  analyzeVision: async (storedName, task = 'general_analysis') => {
    await delay(1200);
    return { status: 'success', ...MOCK_VISION };
  },

  generateAR: async (storedName) => {
    await delay(1500);
    return {
      status: 'success',
      components: MOCK_COMPONENTS,
      relationships: { connections: MOCK_CONNECTIONS },
    };
  },

  askQuestion: async (query, context, history = []) => {
    await delay(1000);
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
