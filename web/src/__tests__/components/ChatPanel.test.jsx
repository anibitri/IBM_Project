import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPanel from '../../components/ChatPanel';

// ── Context mock ─────────────────────────────────────────────────────────────
const mockAskQuestion = vi.fn();
const mockConsumePendingQuestion = vi.fn(() => null);

let mockContextValue = {
  chatHistory: [],
  askQuestion: mockAskQuestion,
  pendingQuestion: null,
  consumePendingQuestion: mockConsumePendingQuestion,
};

vi.mock('@ar-viewer/shared', () => ({
  useDocumentContext: () => mockContextValue,
}));

// markdownUtils returns text as-is in tests
vi.mock('../../components/markdownUtils', () => ({
  renderMarkdown: (text) => text,
}));

function renderPanel(overrides = {}) {
  mockContextValue = { ...mockContextValue, ...overrides };
  return render(<ChatPanel />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockContextValue = {
    chatHistory: [],
    askQuestion: mockAskQuestion,
    pendingQuestion: null,
    consumePendingQuestion: mockConsumePendingQuestion,
  };
});

describe('ChatPanel — welcome state', () => {
  it('shows welcome message and example prompts when history is empty', () => {
    renderPanel();
    expect(screen.getByText('Ask about this diagram')).toBeInTheDocument();
    expect(screen.getByText('What components are detected?')).toBeInTheDocument();
    expect(screen.getByText('Explain the system architecture')).toBeInTheDocument();
    expect(screen.getByText('What are the main connections?')).toBeInTheDocument();
  });

  it('clicking an example prompt populates the input', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByText('What components are detected?'));
    expect(screen.getByRole('textbox')).toHaveValue('What components are detected?');
  });
});

describe('ChatPanel — message rendering', () => {
  it('renders user and assistant messages', () => {
    renderPanel({
      chatHistory: [
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    });
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });
});

describe('ChatPanel — submitting a question', () => {
  it('calls askQuestion and clears input on submit', async () => {
    mockAskQuestion.mockResolvedValue('Some answer');
    const user = userEvent.setup();
    renderPanel();
    const input = screen.getByRole('textbox');
    await user.type(input, 'What is this diagram?');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(mockAskQuestion).toHaveBeenCalledWith('What is this diagram?'));
    expect(input).toHaveValue('');
  });

  it('disables input and send button while waiting for answer', async () => {
    let resolveQuestion;
    mockAskQuestion.mockReturnValue(new Promise((res) => { resolveQuestion = res; }));
    const user = userEvent.setup();
    renderPanel();
    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.keyboard('{Enter}');

    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: /send|submit/i })).toBeDisabled();

    await act(async () => { resolveQuestion('done'); });
  });

  it('does not submit on empty or whitespace input', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.keyboard('{Enter}');
    expect(mockAskQuestion).not.toHaveBeenCalled();
  });

  it('shows error banner when askQuestion rejects', async () => {
    mockAskQuestion.mockRejectedValue(new Error('Model timed out'));
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByRole('textbox'), 'What is X?');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Model timed out');
  });

  it('dismisses the error banner when the ✕ button is clicked', async () => {
    mockAskQuestion.mockRejectedValue(new Error('Timeout'));
    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByRole('textbox'), 'Q');
    await user.keyboard('{Enter}');
    await waitFor(() => screen.getByRole('alert'));
    await user.click(screen.getByLabelText('Dismiss error'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ChatPanel — pending question auto-submit', () => {
  it('auto-submits when pendingQuestion is set', async () => {
    mockAskQuestion.mockResolvedValue('Auto answer');
    mockConsumePendingQuestion.mockReturnValue('Auto question from component');
    renderPanel({ pendingQuestion: 'Auto question from component' });
    await waitFor(() => expect(mockAskQuestion).toHaveBeenCalledWith('Auto question from component'));
  });
});
