import axios from 'axios';

const getBaseURL = () => {
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return 'http://10.0.2.2:4200/api';
  }
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