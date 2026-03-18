import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Raise the warning threshold and add manual chunk splitting
    // to break the 777KB monolithic bundle into cacheable pieces
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — almost never changes, cache forever
          'vendor-react': ['react', 'react-dom'],
          // Animation library — large, keep separate
          'vendor-motion': ['motion'],
          // Charts — recharts + d3 internals are huge
          'vendor-recharts': ['recharts'],
          // Gemini AI SDK
          'vendor-genai': ['@google/genai'],
          // Date utilities
          'vendor-datefns': ['date-fns'],
          // Icon set
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  server: {
    // Proxy WebSocket and API calls to the Express server in dev
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
});