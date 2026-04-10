import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { registerSW } from './registerSW'
import { runScoringTests } from './utils/testScoring.js';

console.log('[Main] Application starting...');

// Expose scoring test for manual verification
if (typeof window !== 'undefined') {
    window.runScoringTests = runScoringTests;
}

registerSW();

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error("Root element not found");

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (e) {
  console.error("Critical Application Failure:", e);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="color: red; padding: 20px; text-align: center;">
        <h1>Application Failed to Start</h1>
        <p>${e.message}</p>
        <pre>${e.stack}</pre>
      </div>
    `;
  }
}
