import React from 'react';
import ReactDOM from 'react-dom/client';
import { enableMapSet } from 'immer';
import App from './App';
import { TooltipProvider } from './components/ui/Tooltip';
import './styles/fonts';
import './styles/globals.css';
import { setSmartTypography } from './lib/markdown';
import { applyAppearance } from './lib/appearance';
import { selectAppearance, selectSmartTypography, useSettingsStore } from './stores/settingsStore';

// Enable Immer plugin for Map and Set support
enableMapSet();

// Before the first render, so a stored "off" never renders with typography; the subscription
// runs before React re-renders, so the preview's next parse already has the new setting
setSmartTypography(selectSmartTypography(useSettingsStore.getState()));

// public/appearance.js already set the theme before first paint; this keeps it in step from here on
applyAppearance(selectAppearance(useSettingsStore.getState()));

useSettingsStore.subscribe((state) => {
  setSmartTypography(selectSmartTypography(state));
  applyAppearance(selectAppearance(state));
});

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
