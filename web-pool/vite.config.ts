import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/pool/',
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'lucide-react'] },
  server: {
    host: '0.0.0.0',
    port: 5173,
    fs: { allow: ['.', '../web/src'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8310',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
