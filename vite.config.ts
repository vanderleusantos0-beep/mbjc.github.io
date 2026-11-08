import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Web Bluetooth und Geolocation brauchen HTTPS (localhost ist ausgenommen).
export default defineConfig({ plugins: [react()], server: { host: true } });
