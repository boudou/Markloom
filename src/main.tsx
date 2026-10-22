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

// The web version works offline and can be installed; the desktop app ships its files and needs neither
if (import.meta.env.PROD && !window.markloomDesktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => console.warn('Markloom: offline support is unavailable', error));
  });
}
