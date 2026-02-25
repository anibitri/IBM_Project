import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': 'http://localhost:4200',
      '/static': 'http://localhost:4200',
    },
  },
  build: {
    outDir: 'build',
  },
});
