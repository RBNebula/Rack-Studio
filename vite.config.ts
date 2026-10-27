import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  // Pre-bundle the STEP worker's CAD kernel, so the dev server does not reload the page when the
  // first import discovers it.
  optimizeDeps: { include: ['occt-import-js'] },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  build: { chunkSizeWarningLimit: 1400 },
});
