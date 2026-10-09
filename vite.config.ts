import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { rollupOptions: { output: { manualChunks: { 'ui-primitives': ['@base-ui/react'] } } } },
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8765' },
  },
});
