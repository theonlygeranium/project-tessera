import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTokens } from './tokens';
import { App } from './App';
import './app.css';

applyTokens();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
