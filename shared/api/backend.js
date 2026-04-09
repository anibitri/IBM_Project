import axios from 'axios';
import { resolveBaseURL } from '../utils/urlResolver';

const API_ACCESS_TOKEN = 'ibm-project-dev-token';

const api = axios.create({
  baseURL: resolveBaseURL(),
  timeout: 300000000, // 30 s for normal requests — analysis uses polling so no long timeout needed
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
  uploadFile: async (file, { signal } = {}) => {
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
      timeout: 14400000, // 4 hours
      signal,
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
    // Submit job — server returns immediately with a job_id (no long-lived connection).
    // This avoids NAT/proxy TCP timeouts (~5 min on ngrok / mobile carriers).
    const startRes = await api.post('/ai/ask/start', { query, context, history });
    const { job_id } = startRes.data;

    // Poll every 15 s until the job finishes or errors.
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const statusRes = await api.get(`/ai/ask/status/${job_id}`);
      const { status, result } = statusRes.data;
      if (status === 'success') return result;
      if (status === 'error') throw new Error(result?.error || 'AI chat failed');
      // 'queued' or 'processing' → keep polling
    }
  },

  chat: async (query, context, history = []) => {
    const startRes = await api.post('/ai/chat/start', { query, context, history });
    const { job_id } = startRes.data;

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const statusRes = await api.get(`/ai/chat/status/${job_id}`);
      const { status, result } = statusRes.data;
      if (status === 'success') return result;
      if (status === 'error') throw new Error(result?.error || 'AI chat failed');
    }
  },

  processDocument: async (storedName, extractAR = true, generateAISummary = true, { signal, onJobId } = {}) => {
    // Submit the job — server returns immediately with a job_id (HTTP 202)
    const startRes = await api.post('/process/start', {
      stored_name: storedName,
      extract_ar: extractAR,
      generate_ai_summary: generateAISummary,
    }, { signal });

    const jobId = startRes.data.job_id;
    onJobId?.(jobId); // let the caller track the job_id for cancellation

    // Poll every 15 s until the job finishes, errors, or is cancelled.
    // GPU inference takes 30–120 s per step so 5 s was needlessly chatty.
    while (true) {
      // Interruptible sleep — resolves after 15 s or rejects immediately on abort
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 15000);
        signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }));
        }, { once: true });
      });

      const statusRes = await api.get(`/process/status/${jobId}`, { signal });
      const { status, result } = statusRes.data;

      if (status === 'success') return result;
      if (status === 'error')   throw new Error(result?.error || 'Processing failed');
      if (status === 'cancelled') throw Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' });
      // 'queued' or 'processing' → keep polling
    }
  },

  cancelProcessing: async (jobId) => {
    if (!jobId) return;
    try {
      await api.post('/process/cancel', { job_id: jobId });
    } catch {
      // Best-effort — ignore errors on cancel
    }
  },

  health: async () => {
    const response = await api.get('/health');
    return response.data;
  },

  setBaseURL: (url) => {
    api.defaults.baseURL = url;
  },
};
