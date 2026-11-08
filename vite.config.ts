import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/mbjc.github.io/',
  plugins: [react()],
  server: {
    host: true
  }
});
