import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the UI runs on :5173 and proxies API/WebSocket traffic to the control server on :4700.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:4700',
      '/ws': { target: 'ws://127.0.0.1:4700', ws: true },
    },
  },
});
