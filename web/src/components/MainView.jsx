import React, { lazy, Suspense } from 'react';
import { useDocumentContext } from '@ar-viewer/shared/context/DocumentContext';
import WelcomeScreen from './WelcomeScreen';

const WorkspaceView = lazy(() => import('./WorkspaceView'));

export default function MainView({ sidebarOpen }) {
  const { document } = useDocumentContext();

  return (
    <main className={`main-view ${sidebarOpen ? 'with-sidebar' : ''}`}>
      {!document ? (
        <WelcomeScreen />
      ) : (
        <Suspense fallback={null}>
          <WorkspaceView />
        </Suspense>
      )}
    </main>
  );
}