import React from 'react';
import ReactDOM from 'react-dom/client';
import { DocumentProvider } from '@ar-viewer/shared';
import './styles/App.css';
import App from './App.jsx';
import ARMockPage from './mocks/ARMockPage.jsx';

const isMockAR = window.location.hash === '#mock-ar' || window.location.pathname === '/mock-ar';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {isMockAR ? (
      <ARMockPage />
    ) : (
      <DocumentProvider>
        <App />
      </DocumentProvider>
    )}
  </React.StrictMode>
);
