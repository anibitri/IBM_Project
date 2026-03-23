/**
 * Tests for shared/api/backend.js in the React Native environment.
 * Verifies API contract, payload shapes, and the error interceptor.
 */

jest.mock('axios');

let backend;
let mockAxiosInstance;
let axiosMock;

beforeEach(() => {
  jest.resetModules();

  mockAxiosInstance = {
    post: jest.fn(),
    get: jest.fn(),
    defaults: { baseURL: '' },
    interceptors: {
      response: { use: jest.fn() },
    },
  };

  // Require axios AFTER resetModules so we get the same instance backend.js will use
  axiosMock = require('axios');
  axiosMock.create = jest.fn(() => mockAxiosInstance);
  axiosMock.post = jest.fn();

  const mod = require('../../../shared/api/backend.js');
  backend = mod.backend;
});

describe('backend.uploadFile', () => {
  it('sends multipart/form-data request', async () => {
    axiosMock.post.mockResolvedValue({ data: { file: { stored_name: 'abc.png' } } });
    const result = await backend.uploadFile({ uri: 'file:///tmp/img.png', type: 'image/png', name: 'img.png' });
    expect(axiosMock.post).toHaveBeenCalledWith(
      expect.stringContaining('/upload/'),
      expect.any(Object), // FormData
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'multipart/form-data' }),
      })
    );
    expect(result.file.stored_name).toBe('abc.png');
  });

  it('works with a plain File object (web-style, no uri)', async () => {
    axiosMock.post.mockResolvedValue({ data: { file: { stored_name: 'web.png' } } });
    const file = new (globalThis.File || class File { name = 'f.png' })(['data'], 'f.png');
    await backend.uploadFile(file);
    expect(axiosMock.post).toHaveBeenCalled();
  });

  it('propagates network error', async () => {
    axiosMock.post.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(backend.uploadFile({ uri: 'file:///tmp/img.png' })).rejects.toThrow('ECONNREFUSED');
  });
});

describe('backend.processDocument', () => {
  it('posts correct payload with defaults', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { status: 'success' } });
    await backend.processDocument('file.pdf');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/process/document', {
      stored_name: 'file.pdf',
      extract_ar: true,
      generate_ai_summary: true,
    });
  });

  it('respects extractAR=false and generateAISummary=false', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { status: 'success' } });
    await backend.processDocument('file.pdf', false, false);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/process/document', {
      stored_name: 'file.pdf',
      extract_ar: false,
      generate_ai_summary: false,
    });
  });
});

describe('backend.analyzeVision', () => {
  it('posts stored_name and task', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { analysis: {} } });
    await backend.analyzeVision('img.png', 'component_detection');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/vision/analyze', {
      stored_name: 'img.png',
      task: 'component_detection',
    });
  });

  it('defaults task to general_analysis', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { analysis: {} } });
    await backend.analyzeVision('img.png');
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/vision/analyze', {
      stored_name: 'img.png',
      task: 'general_analysis',
    });
  });
});

describe('backend.generateAR', () => {
  it('posts correct payload', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { components: [] } });
    await backend.generateAR('img.png', true, ['sequence']);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/ar/generate', {
      stored_name: 'img.png',
      use_vision: true,
      hints: ['sequence'],
    });
  });
});

describe('backend.askQuestion', () => {
  it('includes query, context, and history in payload', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { answer: 'It is a router.' } });
    const ctx = { text_excerpt: 'Diagram text', components: [] };
    const history = [{ role: 'user', content: 'Hi' }];
    const result = await backend.askQuestion('What is the router?', ctx, history);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/ai/ask', {
      query: 'What is the router?',
      context: ctx,
      history,
    });
    expect(result.answer).toBe('It is a router.');
  });

  it('defaults history to empty array', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { answer: 'OK' } });
    await backend.askQuestion('Q?', {});
    const call = mockAxiosInstance.post.mock.calls[0];
    expect(call[1].history).toEqual([]);
  });
});

describe('backend.health', () => {
  it('GETs /health and returns data', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { status: 'healthy', vision_model: 'loaded' } });
    const result = await backend.health();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    expect(result.status).toBe('healthy');
  });
});

describe('backend.setBaseURL', () => {
  it('updates the axios instance baseURL', () => {
    backend.setBaseURL('http://10.0.0.5:4200/api');
    expect(mockAxiosInstance.defaults.baseURL).toBe('http://10.0.0.5:4200/api');
  });
});

describe('error interceptor', () => {
  it('registers a response interceptor on the axios instance', () => {
    expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
  });

  it('passes the interceptor an error handler that extracts server error field', () => {
    const [, onError] = mockAxiosInstance.interceptors.response.use.mock.calls[0];
    const axiosError = new Error('Request failed with status 503');
    axiosError.response = { data: { error: 'Another document is currently being processed.' } };

    return onError(axiosError).catch((e) => {
      expect(e.message).toBe('Another document is currently being processed.');
    });
  });

  it('leaves the message unchanged when response has no error field', () => {
    const [, onError] = mockAxiosInstance.interceptors.response.use.mock.calls[0];
    const axiosError = new Error('Network Error');
    axiosError.response = null;

    return onError(axiosError).catch((e) => {
      expect(e.message).toBe('Network Error');
    });
  });
});
