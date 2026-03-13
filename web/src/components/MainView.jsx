import React from 'react';
import { useDocumentContext } from '@ar-viewer/shared';
import WelcomeScreen from './WelcomeScreen';
import WorkspaceView from './WorkspaceView';

export default function MainView({ sidebarOpen }) {
  const { document } = useDocumentContext();

  return (
    <main className={`main-view ${sidebarOpen ? 'with-sidebar' : ''}`}>
      {!document ? <WelcomeScreen /> : <WorkspaceView />}
    </main>
  );
}