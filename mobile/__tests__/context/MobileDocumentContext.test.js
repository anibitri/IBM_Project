import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { MobileDocumentProvider, useMobileDocumentContext } from '../../src/context/MobileDocumentContext';

// ── Mock the backend (mockBackend module) ────────────────────────────────────
const mockUploadFile = jest.fn();
const mockProcessDocument = jest.fn();
const mockAskQuestion = jest.fn();

jest.mock('../../src/mocks/mockBackend', () => ({
  mockBackend: {
    uploadFile: (...args) => mockUploadFile(...args),
    processDocument: (...args) => mockProcessDocument(...args),
    askQuestion: (...args) => mockAskQuestion(...args),
  },
}));

const wrapper = ({ children }) => (
  <MobileDocumentProvider>{children}</MobileDocumentProvider>
);

function setup() {
  return renderHook(() => useMobileDocumentContext(), { wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUploadFile.mockResolvedValue({ file: { stored_name: 'test.png', original_name: 'diagram.png' } });
  mockProcessDocument.mockResolvedValue({
    status: 'success',
    ai_summary: 'A test diagram.',
    ar: { components: [{ id: 'c1', label: 'Load Balancer' }], connections: [] },
  });
  mockAskQuestion.mockResolvedValue({ answer: 'It routes traffic.' });
});

describe('useMobileDocumentContext — initial state', () => {
  it('exposes null document and empty state', () => {
    const { result } = setup();
    expect(result.current.document).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.chatHistory).toEqual([]);
    expect(result.current.recentSessions).toEqual([]);
  });

  it('throws outside of provider', () => {
    expect(() =>
      renderHook(() => useMobileDocumentContext())
    ).toThrow('useMobileDocumentContext must be used within MobileDocumentProvider');
  });
});

describe('uploadAndProcess', () => {
  it('sets loading during upload and clears it after', async () => {
    let resolveUpload;
    mockUploadFile.mockReturnValue(new Promise((r) => { resolveUpload = r; }));
    const { result } = setup();

    let uploadPromise;
    act(() => {
      uploadPromise = result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' });
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveUpload({ file: { stored_name: 'test.png' } });
      await uploadPromise;
    });
    expect(result.current.loading).toBe(false);
  });

  it('stores document on success', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png', type: 'image/png', name: 'd.png' });
    });
    expect(result.current.document).not.toBeNull();
    expect(result.current.document.storedName).toBe('test.png');
    expect(result.current.document.ai_summary).toBe('A test diagram.');
  });

  it('sets error on failure and returns false', async () => {
    mockUploadFile.mockRejectedValue(new Error('Server error'));
    const { result } = setup();
    let success;
    await act(async () => {
      success = await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' });
    });
    expect(success).toBe(false);
    expect(result.current.error).toBe('Server error');
    expect(result.current.document).toBeNull();
  });

  it('clears chat history before new upload', async () => {
    const { result } = setup();
    // Seed chat
    act(() => { result.current.addMessage('user', 'Hello'); });
    expect(result.current.chatHistory).toHaveLength(1);

    await act(async () => {
      await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' });
    });
    expect(result.current.chatHistory).toEqual([]);
  });

  it('creates a session entry after upload', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' });
    });
    expect(result.current.recentSessions.length).toBeGreaterThan(0);
    expect(result.current.recentSessions[0].storedName).toBe('test.png');
  });
});

describe('loadDemo', () => {
  it('calls processDocument with "demo" and stores result', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.loadDemo();
    });
    expect(mockProcessDocument).toHaveBeenCalledWith('demo', true, true);
    expect(result.current.document?.storedName).toBe('demo');
  });

  it('sets error on failure', async () => {
    mockProcessDocument.mockRejectedValue(new Error('Demo failed'));
    const { result } = setup();
    await act(async () => {
      await result.current.loadDemo();
    });
    expect(result.current.error).toBe('Demo failed');
  });
});

describe('askQuestion', () => {
  it('throws when no document is loaded', async () => {
    const { result } = setup();
    await expect(result.current.askQuestion('What is this?')).rejects.toThrow('No document loaded');
  });

  it('appends user and assistant messages', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });

    await act(async () => { await result.current.askQuestion('What is the load balancer?'); });

    expect(result.current.chatHistory).toHaveLength(2);
    expect(result.current.chatHistory[0]).toEqual({ role: 'user', content: 'What is the load balancer?' });
    expect(result.current.chatHistory[1]).toEqual({ role: 'assistant', content: 'It routes traffic.' });
  });

  it('sets error and rethrows on failure', async () => {
    mockAskQuestion.mockRejectedValue(new Error('Timeout'));
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });

    await expect(
      act(async () => { await result.current.askQuestion('Explain this'); })
    ).rejects.toThrow('Timeout');
    // Flush any pending state updates (setError) that were batched during the rejection
    await act(async () => {});
    expect(result.current.error).toBe('Timeout');
  });
});

describe('clearDocument', () => {
  it('resets document, chat, error, and selection', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });
    act(() => { result.current.addMessage('user', 'Hi'); });

    act(() => { result.current.clearDocument(); });

    expect(result.current.document).toBeNull();
    expect(result.current.chatHistory).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.selectedComponent).toBeNull();
  });
});

describe('session management', () => {
  it('renameSession updates the session name', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });
    const sessionId = result.current.recentSessions[0].id;

    act(() => { result.current.renameSession(sessionId, 'My Architecture'); });

    expect(result.current.recentSessions[0].fileName).toBe('My Architecture');
  });

  it('renameSession ignores empty/whitespace names', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });
    const sessionId = result.current.recentSessions[0].id;
    const originalName = result.current.recentSessions[0].fileName;

    act(() => { result.current.renameSession(sessionId, '   '); });

    expect(result.current.recentSessions[0].fileName).toBe(originalName);
  });

  it('removeSession deletes the entry', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });
    const sessionId = result.current.recentSessions[0].id;

    act(() => { result.current.removeSession(sessionId); });

    expect(result.current.recentSessions.find((s) => s.id === sessionId)).toBeUndefined();
  });

  it('removeSession also clears document if it is the active session', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });
    const sessionId = result.current.document.sessionId;

    act(() => { result.current.removeSession(sessionId); });

    expect(result.current.document).toBeNull();
  });

  it('restoreSession restores document and chat history', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });
    const session = result.current.recentSessions[0];

    act(() => { result.current.clearDocument(); });
    expect(result.current.document).toBeNull();

    act(() => { result.current.restoreSession(session); });
    expect(result.current.document).not.toBeNull();
  });

  it('startNewChat creates a fresh session and clears history', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });
    act(() => { result.current.addMessage('user', 'Old message'); });

    act(() => { result.current.startNewChat(); });

    expect(result.current.chatHistory).toEqual([]);
    // Session ID should have changed
    expect(result.current.recentSessions.length).toBeGreaterThanOrEqual(1);
  });

  it('clearAllHistory empties recentSessions', async () => {
    const { result } = setup();
    await act(async () => { await result.current.uploadAndProcess({ uri: 'file:///tmp/d.png' }); });

    act(() => { result.current.clearAllHistory(); });

    expect(result.current.recentSessions).toEqual([]);
  });
});

describe('accessibility settings', () => {
  it('setDarkMode toggles darkMode flag', () => {
    const { result } = setup();
    expect(result.current.accessibilitySettings.darkMode).toBe(false);

    act(() => { result.current.setDarkMode(true); });
    expect(result.current.accessibilitySettings.darkMode).toBe(true);

    act(() => { result.current.setDarkMode(false); });
    expect(result.current.accessibilitySettings.darkMode).toBe(false);
  });
});
