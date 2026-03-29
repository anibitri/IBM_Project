import axios from 'axios';
import { resolveBaseURL } from '../utils/urlResolver';

const API_ACCESS_TOKEN = 'ibm-project-dev-token';

const api = axios.create({
  baseURL: resolveBaseURL(),
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_ACCESS_TOKEN}`,
    'ngrok-skip-browser-warning': 'true',
  },
});

// Normalise error messages so callers always receive a human-readable string
// instead of a raw Axios "Request failed with status 503" message.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const serverMsg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.response?.data?.detail;
    if (serverMsg) {
      err.message = serverMsg;
    }
    return Promise.reject(err);
  }
);

export const backend = {
  uploadFile: async (file) => {
    const formData = new FormData();
    if (file.uri) {
      // React Native file object
      formData.append('file', {
        uri: file.uri,
        type: file.type || 'image/png',
        name: file.name || 'diagram.png',
      });
    } else {
      // Web File / Blob
      formData.append('file', file);
    }
    const response = await axios.post(`${resolveBaseURL()}/upload/`, formData, {
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
