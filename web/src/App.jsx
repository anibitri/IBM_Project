import React, { useState } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';
import FileUpload from './components/FileUpload';
import ImageViewer from './components/ImageViewer';
import ComponentList from './components/ComponentList';
import ChatInterface from './components/ChatInterface';
import ProcessingStatus from './components/ProcessingStatus';

function App() {
  const { document, loading, error, uploadAndProcess, askQuestion, chatHistory, clearChat } =
    useDocumentContext();
  const [selectedComponent, setSelectedComponent] = useState(null);

  return (
    <div className="app">
      <header className="app-header">
        <h1>📐 AR Diagram Viewer</h1>
        <p>Upload technical diagrams for AI-powered analysis</p>
      </header>

      <div className="app-content">
        {!document && <FileUpload onUpload={uploadAndProcess} loading={loading} error={error} />}

        {loading && <ProcessingStatus />}

        {error && (
          <div className="error-banner">
            ❌ {error}
            <button onClick={() => window.location.reload()}>Try Again</button>
          </div>
        )}

        {document && !loading && (
          <div className="document-view">
            <div className="left-panel">
              <ImageViewer
                imageUrl={document.file.url}
                components={document.ar?.components || []}
                selectedComponent={selectedComponent}
                onComponentClick={setSelectedComponent}
              />
              <div className="document-info">
                <h3>AI Summary</h3>
                <p>{document.ai_summary || 'No summary available'}</p>
              </div>
            </div>

            <div className="middle-panel">
              <ComponentList
                components={document.ar?.components || []}
                selectedComponent={selectedComponent}
                onSelectComponent={setSelectedComponent}
              />
            </div>

            <div className="right-panel">
              <ChatInterface
                onSendMessage={askQuestion}
                chatHistory={chatHistory}
                loading={loading}
                onClearHistory={clearChat}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;