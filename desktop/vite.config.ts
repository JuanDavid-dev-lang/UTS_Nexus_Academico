// `vitest/config` re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Vite configuration.
 *
 * Tauri runs the dev server on a fixed port and needs a strict port so the
 * native shell can attach to it reliably.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    watch: {
      // The Rust side is rebuilt by cargo, not by Vite.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    // Tauri targets modern WebViews only, so we can ship smaller output.
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing libraries so the app shell stays small
        // and a dependency bump does not invalidate the whole cache.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['echarts'],
          query: ['@tanstack/react-query', '@tanstack/react-virtual'],
          motion: ['framer-motion'],
          realtime: ['socket.io-client'],
          validation: ['zod'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
