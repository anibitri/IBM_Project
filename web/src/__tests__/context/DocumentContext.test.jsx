import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { DocumentProvider, useDocumentContext } from '@ar-viewer/shared';

// Mock the backend transport layer used by DocumentContext internally.
vi.mock('../../../../shared/api/backend.js', () => ({
  backend: {
    uploadFile: vi.fn(),
    processDocument: vi.fn(),
    askQuestion: vi.fn(),
    health: vi.fn(),
  },
}));

import { backend } from '../../../../shared/api/backend.js';

// Renders useDocumentContext inside a DocumentProvider, returns result.current
function setup() {
  const wrapper = ({ children }) => React.createElement(DocumentProvider, null, children);
  return renderHook(() => useDocumentContext(), { wrapper });
}

describe('DocumentContext — initial state', () => {
  it('starts with null document and empty chat history', () => {
    const { result } = setup();
    expect(result.current.document).toBeNull();
    expect(result.current.chatHistory).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('DocumentContext — uploadAndProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.uploadFile.mockResolvedValue({ file: { stored_name: 'abc.pdf', original_name: 'diagram.pdf' } });
    backend.processDocument.mockResolvedValue({ status: 'success', ai_summary: 'A test diagram.' });
  });

  it('sets loading true during upload, then false after', async () => {
    let resolveUpload;
    backend.uploadFile.mockReturnValue(new Promise((res) => { resolveUpload = res; }));

    const { result } = setup();

    const uploadPromise = result.current.uploadAndProcess({ uri: 'file:///tmp/diagram.pdf' });
    await act(async () => {});

    expect(result.current.loading).toBe(true);

    resolveUpload({ file: { stored_name: 'abc.pdf', original_name: 'diagram.pdf' } });
    await act(async () => { await uploadPromise; });

    expect(result.current.loading).toBe(false);
  });

  it('stores the processed document', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' });
    });

    expect(result.current.document).not.toBeNull();
    expect(result.current.document.storedName).toBe('abc.pdf');
    expect(result.current.document.ai_summary).toBe('A test diagram.');
  });

  it('sets error and clears document on backend failure', async () => {
    backend.uploadFile.mockRejectedValue(new Error('Server unavailable'));
    const { result } = setup();

    await act(async () => {
      await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' });
    });

    expect(result.current.error).toBe('Server unavailable');
    expect(result.current.document).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('clears previous chat history when uploading a new document', async () => {
    const { result } = setup();

    await act(async () => { result.current.addMessage('user', 'Hello'); });
    expect(result.current.chatHistory.length).toBe(1);

    await act(async () => {
      await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' });
    });

    expect(result.current.chatHistory).toEqual([]);
  });
});

describe('DocumentContext — askQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.uploadFile.mockResolvedValue({ file: { stored_name: 'abc.pdf' } });
    backend.processDocument.mockResolvedValue({ status: 'success' });
    backend.askQuestion.mockResolvedValue({ answer: 'The diagram shows X.' });
  });

  it('throws if no document is loaded', async () => {
    const { result } = setup();
    await expect(result.current.askQuestion('What is this?')).rejects.toThrow('No document loaded');
  });

  it('adds user and assistant messages to chat history', async () => {
    const { result } = setup();

    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' }); });
    await act(async () => { await result.current.askQuestion('What components are shown?'); });

    expect(result.current.chatHistory).toHaveLength(2);
    expect(result.current.chatHistory[0]).toEqual({ role: 'user', content: 'What components are shown?' });
    expect(result.current.chatHistory[1]).toEqual({ role: 'assistant', content: 'The diagram shows X.' });
  });

  it('sets error and rethrows when askQuestion fails', async () => {
    backend.askQuestion.mockRejectedValue(new Error('Model unavailable'));
    const { result } = setup();

    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' }); });

    // Catch inside act so the flush runs before act exits, then check state
    let caughtError;
    await act(async () => {
      try { await result.current.askQuestion('Explain this'); }
      catch (err) { caughtError = err; }
    });

    expect(caughtError?.message).toBe('Model unavailable');
    expect(result.current.error).toBe('Model unavailable');
  });
});

describe('DocumentContext — clearDocument', () => {
  it('resets all state and saves session to history', async () => {
    vi.clearAllMocks();
    backend.uploadFile.mockResolvedValue({ file: { stored_name: 'abc.pdf' } });
    backend.processDocument.mockResolvedValue({ status: 'success', ai_summary: 'Demo' });

    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' }); });
    expect(result.current.document).not.toBeNull();

    act(() => { result.current.clearDocument(); });

    expect(result.current.document).toBeNull();
    expect(result.current.chatHistory).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe('DocumentContext — session management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.uploadFile.mockResolvedValue({ file: { stored_name: 'abc.pdf', original_name: 'test.pdf' } });
    backend.processDocument.mockResolvedValue({ status: 'success' });
  });

  it('renameSession updates the session file name', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' }); });

    const sessionId = result.current.recentSessions[0]?.id;
    act(() => { result.current.renameSession(sessionId, 'My Diagram'); });

    expect(result.current.recentSessions.find((s) => s.id === sessionId)?.fileName).toBe('My Diagram');
  });

  it('removeSession removes the entry', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' }); });

    const sessionId = result.current.recentSessions[0]?.id;
    act(() => { result.current.removeSession(sessionId); });

    expect(result.current.recentSessions.find((s) => s.id === sessionId)).toBeUndefined();
  });

  it('clearAllHistory empties recentSessions', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' }); });

    act(() => { result.current.clearAllHistory(); });

    expect(result.current.recentSessions).toEqual([]);
  });
});

describe('DocumentContext — pendingQuestion', () => {
  it('consumePendingQuestion returns and clears the pending question', async () => {
    vi.clearAllMocks();
    backend.uploadFile.mockResolvedValue({ file: { stored_name: 'abc.pdf' } });
    backend.processDocument.mockResolvedValue({ status: 'success' });

    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.pdf' }); });

    act(() => { result.current.askAboutComponent({ id: 'c1', label: 'API Gateway' }); });
    expect(result.current.pendingQuestion).toContain('API Gateway');

    let consumed;
    act(() => { consumed = result.current.consumePendingQuestion(); });

    expect(consumed).toContain('API Gateway');
    expect(result.current.pendingQuestion).toBeNull();
  });
});
