import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode can cause double-invocations which might be confusing with camera streams in dev, 
  // but good for catching errors. We keep it.
  <React.StrictMode>
    <App />
  </React.StrictMode>
);