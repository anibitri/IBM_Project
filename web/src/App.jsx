import React, { useState } from 'react';
import { useDocumentContext } from '@ar-viewer/shared';
import Sidebar from './components/Sidebar';
import MainView from './components/MainView';
import './styles/App.css';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="app">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <MainView sidebarOpen={sidebarOpen} />
    </div>
  );
}

export default App;