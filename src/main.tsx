import React from 'react';
import ReactDOM from 'react-dom/client';
import { enableMapSet } from 'immer';
import App from './App';
import { TooltipProvider } from './components/ui/Tooltip';
import './styles/fonts';
import './styles/globals.css';

// Enable Immer plugin for Map and Set support
enableMapSet();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);
