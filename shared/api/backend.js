import axios from 'axios';

const API_ACCESS_TOKEN = 'ibm-project-dev-token';

// ── Backend URL configuration ────────────────────────────────
// Set PHYSICAL_DEVICE = true  when running on a real device via USB
// Set PHYSICAL_DEVICE = false when using an Android or iOS simulator/emulator
const PHYSICAL_DEVICE = true;

// iOS physical device only: set this to the Mac's iPhone USB interface IP
// (found via System Preferences → Network → "iPhone USB", e.g. 172.20.10.1)
// Android physical device uses localhost via adb reverse, so this is ignored.
const IOS_USB_HOST = '192.168.x.x'; // Replace with Mac's IP: run `ipconfig getifaddr en0`

const getBaseURL = () => {
  // Web browser — use relative path (Vite proxy handles /api -> backend)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return '/api';
  }
  // React Native
  try {
    // eslint-disable-next-line no-undef
    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');
    if (isAndroid && !PHYSICAL_DEVICE) {
      // Android emulator: 10.0.2.2 is the special alias for the host machine
      return 'http://10.0.2.2:4200/api';
    }
  } catch { /* ignore */ }
  // iOS physical device: use the Mac's iPhone USB interface IP directly
  if (PHYSICAL_DEVICE) {
    return `http://${IOS_USB_HOST}:4200/api`;
  }
  // iOS simulator: localhost works (simulator shares Mac's network stack)
  return 'http://localhost:4200/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_ACCESS_TOKEN}`,
  },
});

export const backend = {
  uploadFile: async (file) => {
    const formData = new FormData();
    if (file.uri) {
      formData.append('file', {
        uri: file.uri,
        type: file.type || 'image/png',
        name: file.name || 'diagram.png',
      });
    } else {
      formData.append('file', file);
    }
    const response = await axios.post(`${getBaseURL()}/upload/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${API_ACCESS_TOKEN}`,
      },
    });
    return response.data;
  },

  analyzeVision: async (storedName, task = 'general_analysis') => {
    const response = await api.post('/vision/analyze', { stored_name: storedName, task });
    return response.data;
  },

  generateAR: async (storedName, useVision = true, hints = []) => {
    const response = await api.post('/ar/generate', {
      stored_name: storedName,
      use_vision: useVision,
      hints,
    });
    return response.data;
  },

  askQuestion: async (query, context, history = []) => {
    const response = await api.post('/ai/ask', { query, context, history });
    return response.data;
  },

  chat: async (query, context, history = []) => {
    const response = await api.post('/ai/chat', { query, context, history });
    return response.data;
  },

  processDocument: async (storedName, extractAR = true, generateAISummary = true) => {
    const response = await api.post('/process/document', {
      stored_name: storedName,
      extract_ar: extractAR,
      generate_ai_summary: generateAISummary,
    });
    return response.data;
  },

  health: async () => {
    const response = await api.get('/health');
    return response.data;
  },

  setBaseURL: (url) => {
    api.defaults.baseURL = url;
  },
};