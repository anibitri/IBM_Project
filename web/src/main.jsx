import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { DocumentProvider } from '@ar-viewer/shared/context/DocumentContext';
import './styles/App.css';
import App from './App.jsx';

const ARMockPage = lazy(() => import('./mocks/ARMockPage.jsx'));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#ff453a', fontFamily: 'monospace', background: '#1c1c1e', minHeight: '100vh' }}>
          <h2 style={{ color: '#ff453a' }}>Render Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error.stack || this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const isMockAR = window.location.hash === '#mock-ar' || window.location.pathname === '/mock-ar';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={null}>
        {isMockAR ? (
          <ARMockPage />
        ) : (
          <DocumentProvider>
            <App />
          </DocumentProvider>
        )}
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
