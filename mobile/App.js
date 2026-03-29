import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MobileDocumentProvider } from './src/context/MobileDocumentContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MobileDocumentProvider>
        <AppNavigator />
      </MobileDocumentProvider>
    </GestureHandlerRootView>
  );
}