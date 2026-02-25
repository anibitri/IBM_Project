import React, { useState } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';
import LandingPage from './LandingPage';
import DiagramView from './DiagramView';

export default function MainContent({ sidebarOpen }) {
  const { document, loading, error } = useDocumentContext();
  const [selectedComponent, setSelectedComponent] = useState(null);

  // Show landing page if no document
  if (!document) {
    return <LandingPage loading={loading} error={error} />;
  }

  // Show diagram view if document loaded
  return (
    <main className={`main-content ${sidebarOpen ? 'with-sidebar' : ''}`}>
      <DiagramView
        document={document}
        selectedComponent={selectedComponent}
        onComponentSelect={setSelectedComponent}
      />
    </main>
  );
}