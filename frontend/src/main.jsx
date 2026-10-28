import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import RefreshProvider from './context/RefreshProvider';
import DisplayProvider from './context/DisplayProvider';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* DisplayProvider outside: the refresh logic reads Display mode (wake-up recovery) */}
      <DisplayProvider>
        <RefreshProvider>
          <App />
        </RefreshProvider>
      </DisplayProvider>
    </BrowserRouter>
  </StrictMode>
);
