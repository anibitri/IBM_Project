import React from 'react';
import ReactDOM from 'react-dom/client';
import { DocumentProvider } from '@ar-viewer/shared';
import './styles/App.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <DocumentProvider>
      <App />
    </DocumentProvider>
  </React.StrictMode>
);