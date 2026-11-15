import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev: `npm run demo` (API on :8787 with made-up mail) and `npm run dev:web` (this, with hot reload on :5173).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    proxy: { '/api': 'http://localhost:8787', '/auth': 'http://localhost:8787' },
  },
});
