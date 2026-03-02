import axios from 'axios';

const getBaseURL = () => {
  // Web browser — use relative path (Vite proxy handles /api -> backend)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return '/api';
  }
  // React Native — detect platform via user agent or global constants
  try {
    // eslint-disable-next-line no-undef
    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');
    if (isAndroid) {
      // Android emulator uses 10.0.2.2 to reach host
      return 'http://10.0.2.2:4200/api';
    }
  } catch { /* ignore */ }
  // iOS simulator / default
  return 'http://localhost:4200/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'multipart/form-data' },
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