import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'api': path.resolve(__dirname, './src/services/api'),
      '@/api': path.resolve(__dirname, './src/services/api'),
    },
  },
  server: {
    port: 5173,
  },
});
