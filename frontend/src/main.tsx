import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { isMobileClientPath } from './lib/isMobileClient';

// PWA-registrering (manifest + service worker) begränsad till mobilvyn (se App.tsx/lib/isMobileClient.ts)
// — skrivbordskartan ska inte trigga en "installera app"-prompt med start_url pekande mot /report.
if (isMobileClientPath()) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.json';
  document.head.appendChild(link);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
