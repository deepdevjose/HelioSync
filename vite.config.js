import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('@react-three') || id.includes('/three/')) {
            return 'three-vendor';
          }

          if (id.includes('recharts')) {
            return 'charts-vendor';
          }

          if (id.includes('firebase')) {
            return 'firebase-vendor';
          }

          if (id.includes('framer-motion') || id.includes('motion-dom')) {
            return 'motion-vendor';
          }

          if (id.includes('lucide-react')) {
            return 'icons-vendor';
          }
        },
      },
    },
  },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'HelioSync',
      short_name: 'HelioSync',
      description: 'Monitoreo de trazador solar IoT',
      theme_color: '#0B0D14',
      background_color: '#0B0D14',
      display: 'standalone',
      icons: [
        {
           src: 'sun_icon192.png', // Placeholder
           sizes: '192x192',
           type: 'image/png'
        },
        {
           src: 'sun_icon512.png', // Placeholder
           sizes: '512x512',
           type: 'image/png'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg}']
    }
  }), cloudflare()]
});