import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WorkspaceView from '../../components/WorkspaceView';

// ── Stub heavy child panels ──────────────────────────────────────────────────
vi.mock('../../components/DiagramPanel', () => ({
  default: () => <div data-testid="diagram-panel">DiagramPanel</div>,
}));
vi.mock('../../components/ChatPanel', () => ({
  default: () => <div data-testid="chat-panel">ChatPanel</div>,
}));

let mockContextValue = {
  pendingQuestion: null,
  document: null,
};

vi.mock('@ar-viewer/shared', () => ({
  useDocumentContext: () => mockContextValue,
}));

function renderWorkspace(overrides = {}) {
  mockContextValue = { ...mockContextValue, ...overrides };
  return render(<WorkspaceView />);
}

beforeEach(() => {
  mockContextValue = { pendingQuestion: null, document: null };
});

describe('WorkspaceView — default panels', () => {
  it('renders Diagram and Chat panels by default', () => {
    renderWorkspace();
    expect(screen.getByTestId('diagram-panel')).toBeInTheDocument();
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
  });

  it('shows all four panel toggle buttons', () => {
    renderWorkspace();
    expect(screen.getByTitle(/Diagram/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Chat/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Document/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Info/i)).toBeInTheDocument();
  });
});

describe('WorkspaceView — panel toggling', () => {
  it('hides a panel when its toggle button is clicked', () => {
    renderWorkspace();
    fireEvent.click(screen.getByTitle(/Hide Chat/i));
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
  });

  it('shows a panel when its toggle button is clicked again', () => {
    renderWorkspace();
    fireEvent.click(screen.getByTitle(/Hide Chat/i));
    fireEvent.click(screen.getByTitle(/Show Chat/i));
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
  });

  it('does not close the last open panel', () => {
    renderWorkspace();
    // Close chat first
    fireEvent.click(screen.getByTitle(/Hide Chat/i));
    // Now try to close diagram too
    fireEvent.click(screen.getByTitle(/Hide Diagram/i));
    // Diagram panel should still be visible
    expect(screen.getByTestId('diagram-panel')).toBeInTheDocument();
  });
});

describe('WorkspaceView — pending question', () => {
  it('auto-opens chat panel when pendingQuestion arrives', () => {
    const { rerender } = renderWorkspace();
    // Close chat first
    fireEvent.click(screen.getByTitle(/Hide Chat/i));
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();

    // Simulate pendingQuestion arriving
    mockContextValue = { ...mockContextValue, pendingQuestion: 'Tell me about X' };
    rerender(<WorkspaceView />);

    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
  });
});

describe('WorkspaceView — document filename', () => {
  it('shows filename from document in header', () => {
    renderWorkspace({ document: { file: { original_name: 'architecture.pdf' } } });
    expect(screen.getByText('architecture.pdf')).toBeInTheDocument();
  });

  it('shows "Document" when no document is loaded', () => {
    renderWorkspace({ document: null });
    // The header title span should say "Document" when no file is loaded
    expect(document.querySelector('.workspace-doc-title')).toHaveTextContent('Document');
  });
});

describe('WorkspaceView — DocumentInfoPanel confidence guard', () => {
  it('renders 0% confidence when confidence field is missing from a component', () => {
    renderWorkspace({
      document: {
        file: { original_name: 'test.png' },
        ar: {
          components: [{ id: 'c1', label: 'Router' /* no confidence field */ }],
          relationships: { connections: [] },
        },
      },
    });
    // Open info panel
    fireEvent.click(screen.getByTitle(/Show Info/i));
    // Should render "0%" not "NaN%" in the per-component confidence column
    expect(screen.queryByText(/NaN%/i)).not.toBeInTheDocument();
    // The component row confidence cell should be 0%, not NaN%
    const confCells = document.querySelectorAll('.doc-info-comp-conf');
    expect(confCells.length).toBeGreaterThan(0);
    expect(confCells[0]).toHaveTextContent('0%');
  });
});
