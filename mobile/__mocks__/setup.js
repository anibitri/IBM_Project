// ── Silence React Native "act" warnings in test output ──────────────────────
import 'react-native-gesture-handler/jestSetup';

// react-native-reanimated mock
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// react-native-vector-icons
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

// react-native-document-picker
jest.mock('react-native-document-picker', () => ({
  pickSingle: jest.fn(),
  isCancel: jest.fn((err) => err && err.code === 'DOCUMENT_PICKER_CANCELED'),
  types: { images: 'public.image', pdf: 'com.adobe.pdf' },
}));

// react-native-image-picker
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));

// react-native-vision-camera
jest.mock('react-native-vision-camera', () => ({
  useCameraDevice: jest.fn(() => ({ id: 'mock-camera' })),
  useCameraPermission: jest.fn(() => ({ hasPermission: true, requestPermission: jest.fn() })),
  Camera: 'Camera',
}));

// @reactvision/react-viro — not available in test environment
jest.mock('@reactvision/react-viro', () => ({
  ViroARSceneNavigator: 'ViroARSceneNavigator',
  ViroARScene: 'ViroARScene',
  ViroARImageMarker: 'ViroARImageMarker',
  ViroARTrackingTargets: { createTargets: jest.fn() },
  ViroText: 'ViroText',
  ViroNode: 'ViroNode',
  ViroAnimations: { registerAnimations: jest.fn() },
}));

// react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
}));

// react-native-tts
jest.mock('react-native-tts', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// react-native-svg (minimal stub)
jest.mock('react-native-svg', () => {
  const React = require('react');
  const Svg = ({ children }) => React.createElement('svg', null, children);
  const mocked = (name) => ({ children }) => React.createElement(name, null, children);
  return {
    default: Svg,
    Svg,
    Circle: mocked('circle'),
    Line: mocked('line'),
    Rect: mocked('rect'),
    G: mocked('g'),
    Text: mocked('text'),
  };
});
