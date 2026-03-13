import React from 'react';
import { MobileDocumentProvider } from './src/context/MobileDocumentContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <MobileDocumentProvider>
      <AppNavigator />
    </MobileDocumentProvider>
  );
}