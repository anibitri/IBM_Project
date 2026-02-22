import React from 'react';
import { DocumentProvider } from '@ar-viewer/shared';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <DocumentProvider>
      <AppNavigator />
    </DocumentProvider>
  );
}