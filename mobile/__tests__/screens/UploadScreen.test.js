import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import UploadScreen from '../../src/screens/UploadScreen';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';

// ── Context mock ─────────────────────────────────────────────────────────────
const mockUploadAndProcess = jest.fn();
const mockClearDocument = jest.fn();

let mockContextValue = {
  loading: false,
  error: null,
  uploadAndProcess: mockUploadAndProcess,
  clearDocument: mockClearDocument,
  accessibilitySettings: { darkMode: false },
};

jest.mock('../../src/context/MobileDocumentContext', () => ({
  useMobileDocumentContext: () => mockContextValue,
}));

const mockNavigate = jest.fn();
const navigation = { navigate: mockNavigate };

function renderScreen(overrides = {}) {
  mockContextValue = { ...mockContextValue, ...overrides };
  return render(<UploadScreen navigation={navigation} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContextValue = {
    loading: false,
    error: null,
    uploadAndProcess: mockUploadAndProcess,
    clearDocument: mockClearDocument,
    accessibilitySettings: { darkMode: false },
  };
  mockUploadAndProcess.mockResolvedValue(true);
});

describe('UploadScreen — idle state', () => {
  it('renders all three upload buttons', () => {
    const { getByText } = renderScreen();
    expect(getByText('Choose from Gallery')).toBeTruthy();
    expect(getByText('Take Photo')).toBeTruthy();
    expect(getByText('Browse Files (PDF)')).toBeTruthy();
  });

  it('renders the header title', () => {
    const { getByText } = renderScreen();
    expect(getByText('AR Diagram Viewer')).toBeTruthy();
  });

  it('shows supported formats in footer', () => {
    const { getByText } = renderScreen();
    expect(getByText(/PNG, JPG, PDF/i)).toBeTruthy();
  });
});

describe('UploadScreen — loading state', () => {
  it('shows loading indicator and hides buttons while loading', () => {
    const { getByText, queryByText } = renderScreen({ loading: true });
    expect(getByText('Processing document...')).toBeTruthy();
    expect(queryByText('Choose from Gallery')).toBeNull();
  });

  it('shows cancel button during loading', () => {
    const { getByText } = renderScreen({ loading: true });
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('calls clearDocument when cancel is pressed', () => {
    const { getByText } = renderScreen({ loading: true });
    fireEvent.press(getByText('Cancel'));
    expect(mockClearDocument).toHaveBeenCalled();
  });
});

describe('UploadScreen — error state', () => {
  it('shows error message when error is set', () => {
    const { getByText } = renderScreen({ error: 'Failed to process document' });
    expect(getByText('Failed to process document')).toBeTruthy();
  });

  it('shows Try Again button when error is set', () => {
    const { getByText } = renderScreen({ error: 'Something went wrong' });
    expect(getByText('Try Again')).toBeTruthy();
  });
});

describe('UploadScreen — image gallery picker', () => {
  it('calls uploadAndProcess and navigates to Diagram on success', async () => {
    launchImageLibrary.mockImplementation((opts, cb) => {
      cb?.({ assets: [{ uri: 'file:///tmp/img.png', type: 'image/png', fileName: 'img.png' }] });
    });
    // react-native-image-picker v8 returns a promise
    launchImageLibrary.mockResolvedValue({
      assets: [{ uri: 'file:///tmp/img.png', type: 'image/png', fileName: 'img.png' }],
    });

    const { getByText } = renderScreen();
    fireEvent.press(getByText('Choose from Gallery'));

    await waitFor(() => expect(mockUploadAndProcess).toHaveBeenCalledWith({
      uri: 'file:///tmp/img.png',
      type: 'image/png',
      name: 'img.png',
    }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Diagram'));
  });

  it('does nothing when user cancels gallery picker', async () => {
    launchImageLibrary.mockResolvedValue({ didCancel: true });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Choose from Gallery'));
    await waitFor(() => expect(mockUploadAndProcess).not.toHaveBeenCalled());
  });

  it('shows alert on image picker error', async () => {
    jest.spyOn(Alert, 'alert');
    launchImageLibrary.mockResolvedValue({ errorCode: 'permission', errorMessage: 'No permission' });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Choose from Gallery'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', 'No permission'));
  });

  it('does not crash when assets array is empty', async () => {
    launchImageLibrary.mockResolvedValue({ assets: [] });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Choose from Gallery'));
    await waitFor(() => expect(mockUploadAndProcess).not.toHaveBeenCalled());
  });
});

describe('UploadScreen — camera', () => {
  it('calls uploadAndProcess and navigates on success', async () => {
    launchCamera.mockResolvedValue({
      assets: [{ uri: 'file:///tmp/photo.jpg', type: 'image/jpeg', fileName: 'photo.jpg' }],
    });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Take Photo'));

    await waitFor(() => expect(mockUploadAndProcess).toHaveBeenCalledWith({
      uri: 'file:///tmp/photo.jpg',
      type: 'image/jpeg',
      name: 'photo.jpg',
    }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Diagram'));
  });

  it('shows camera error alert on permission denial', async () => {
    jest.spyOn(Alert, 'alert');
    launchCamera.mockResolvedValue({ errorCode: 'permission', errorMessage: 'Camera not available' });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Take Photo'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Camera Error', 'Camera not available'));
  });

  it('does nothing when user cancels camera', async () => {
    launchCamera.mockResolvedValue({ didCancel: true });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Take Photo'));
    await waitFor(() => expect(mockUploadAndProcess).not.toHaveBeenCalled());
  });

  it('does not crash when camera assets array is empty', async () => {
    launchCamera.mockResolvedValue({ assets: [] });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Take Photo'));
    await waitFor(() => expect(mockUploadAndProcess).not.toHaveBeenCalled());
  });
});

describe('UploadScreen — document picker', () => {
  it('calls uploadAndProcess with picked PDF', async () => {
    DocumentPicker.pickSingle.mockResolvedValue({
      uri: 'content://doc.pdf',
      fileCopyUri: 'file:///tmp/doc.pdf',
      type: 'application/pdf',
      name: 'doc.pdf',
    });
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Browse Files (PDF)'));

    await waitFor(() => expect(mockUploadAndProcess).toHaveBeenCalledWith({
      uri: 'file:///tmp/doc.pdf',
      type: 'application/pdf',
      name: 'doc.pdf',
    }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Diagram'));
  });

  it('does nothing when user cancels document picker', async () => {
    const cancelError = new Error('cancel');
    cancelError.code = 'DOCUMENT_PICKER_CANCELED';
    DocumentPicker.pickSingle.mockRejectedValue(cancelError);
    DocumentPicker.isCancel.mockReturnValue(true);

    const { getByText } = renderScreen();
    fireEvent.press(getByText('Browse Files (PDF)'));
    await waitFor(() => expect(mockUploadAndProcess).not.toHaveBeenCalled());
  });

  it('shows alert on non-cancel document picker error', async () => {
    jest.spyOn(Alert, 'alert');
    DocumentPicker.pickSingle.mockRejectedValue(new Error('Unknown error'));
    DocumentPicker.isCancel.mockReturnValue(false);

    const { getByText } = renderScreen();
    fireEvent.press(getByText('Browse Files (PDF)'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to pick document'));
  });
});

describe('UploadScreen — dark mode', () => {
  it('renders without crashing in dark mode', () => {
    const { getByText } = renderScreen({ accessibilitySettings: { darkMode: true } });
    expect(getByText('AR Diagram Viewer')).toBeTruthy();
  });
});
