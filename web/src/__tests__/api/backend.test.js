import { describe, it, expect, vi, beforeEach } from 'vitest';
import { backend } from '@ar-viewer/shared';
import axios from 'axios';

// vi.hoisted runs before vi.mock hoisting, making the instance available
// inside the mock factory without temporal dead zone issues.
const mockAxiosInstance = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  defaults: { baseURL: '' },
  interceptors: { response: { use: vi.fn() } },
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance),
    post: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('backend.uploadFile', () => {
  it('posts to /upload/ with multipart form data', async () => {
    axios.post.mockResolvedValue({ data: { file: { stored_name: 'abc.png' } } });
    const result = await backend.uploadFile({ uri: 'file:///tmp/img.png', type: 'image/png', name: 'img.png' });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/upload/'),
      expect.any(FormData),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'multipart/form-data' }) })
    );
    expect(result.file.stored_name).toBe('abc.png');
  });

  it('propagates network errors', async () => {
    axios.post.mockRejectedValue(new Error('Network Error'));
    await expect(backend.uploadFile({ uri: 'file:///tmp/img.png' })).rejects.toThrow('Network Error');
  });
});

describe('backend.processDocument', () => {
  it('posts correct payload', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { status: 'success' } });
    await backend.processDocument('file.pdf', true, false);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/process/document', {
      stored_name: 'file.pdf',
      extract_ar: true,
      generate_ai_summary: false,
    });
  });
});

describe('backend.health', () => {
  it('calls GET /health', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { status: 'healthy' } });
    const result = await backend.health();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    expect(result.status).toBe('healthy');
  });
});

describe('backend.askQuestion', () => {
  it('posts query, context, and history to /ai/ask', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { answer: 'Yes' } });
    const result = await backend.askQuestion('What is X?', { text: 'doc' }, []);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/ai/ask', {
      query: 'What is X?',
      context: { text: 'doc' },
      history: [],
    });
    expect(result.answer).toBe('Yes');
  });
});

describe('backend.setBaseURL', () => {
  it('updates the axios instance base URL', () => {
    backend.setBaseURL('http://192.168.1.5:4200/api');
    expect(mockAxiosInstance.defaults.baseURL).toBe('http://192.168.1.5:4200/api');
  });
});
