import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Listen on the local network too, so the terminal prints a "Network:" address others can open.
    host: true,
    // During development, any request starting with /api is forwarded to our backend.
    // The frontend therefore only ever uses relative URLs like /api/health.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});