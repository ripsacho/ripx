import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Load .env from repo root so VITE_* and backend can share one .env when running npm run dev from root
  envDir: path.resolve(__dirname, '..'),
  server: {
    host: true,
    port: Number(process.env.VITE_PORT) || Number(process.env.FRONTEND_PORT) || 3001,
    // allowedHosts: true for tunnels (e.g. Shopify). For local-only dev, use ['localhost', '.localhost', '127.0.0.1']
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // Do not proxy /health: same-origin /health is handled by React Router → /admin/system-health.
      // JSON health: GET /api/health (proxied) or backend :3000/health directly.
    }
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    assetsInlineLimit: 4096,
    // Disable sourcemaps in production for security and performance
    sourcemap: process.env.NODE_ENV !== 'production',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production', // Remove console.log in production
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        // Code splitting for better caching
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'polaris-vendor': ['@shopify/polaris', '@shopify/app-bridge', '@shopify/app-bridge-react'],
          'query-vendor': ['@tanstack/react-query'],
          'charts-vendor': ['recharts'],
          'api-vendor': ['axios']
        }
      }
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000
  }
});

