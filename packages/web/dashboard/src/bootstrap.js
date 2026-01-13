import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const mount = (el, props = {}) => {
  const root = createRoot(el);
  root.render(<App {...props} />);
};

// Check if we are in development/standalone
const devRoot = document.getElementById('root');
if (devRoot) {
  // In standalone, we have no host user, so we pass null/empty
  mount(devRoot, { user: null, token: null });
}

// Export mount for the Host to use (Module Federation)
export { mount };