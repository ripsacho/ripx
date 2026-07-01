import { createLogger, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger();
const loggerWarn = logger.warn;

logger.warn = (message, options) => {
  const text = String(message || '');
  if (
    text.includes('[esbuild css minify]') &&
    text.includes('@media (--p-breakpoints-md-up) and print')
  ) {
    return;
  }
  loggerWarn(message, options);
};

function resolveManualChunk(id) {
  if (!id || typeof id !== 'string') return undefined;
  if (process.env.RIPX_DISABLE_MANUAL_CHUNKS === 'true') return undefined;
  if (id.includes('node_modules')) {
    if (
      id.includes('/react/') ||
      id.includes('/react-dom/') ||
      id.includes('/react-router-dom/')
    ) {
      return 'react-vendor';
    }
    if (
      id.includes('/@shopify/polaris/') ||
      id.includes('/@shopify/app-bridge/') ||
      id.includes('/@shopify/app-bridge-react/')
    ) {
      return 'polaris-vendor';
    }
    if (id.includes('/@tanstack/react-query/')) {
      return 'query-vendor';
    }
    if (id.includes('/recharts/')) {
      return 'charts-vendor';
    }
    if (id.includes('/axios/')) {
      return 'api-vendor';
    }
  }
  return undefined;
}

export default defineConfig(() => {
  const backendPort = Number(process.env.PORT) || 3000;
  const backendProxyTarget = `http://localhost:${backendPort}`;
  return {
    plugins: [react()],
    customLogger: logger,
    // Load .env from repo root so VITE_* and backend can share one .env when running npm run dev from root
    envDir: path.resolve(__dirname, '..'),
    server: {
      host: true,
      port: Number(process.env.VITE_PORT) || Number(process.env.FRONTEND_PORT) || 3001,
      // Keep this explicit to avoid Vite auto-detection edge-cases in agent environments.
      // The browser runtime constant is injected by Vite from this setting.
      forwardConsole: false,
      // allowedHosts: true for tunnels (e.g. Shopify). For local-only dev, use ['localhost', '.localhost', '127.0.0.1']
      allowedHosts: true,
      proxy: {
        '/api': {
          target: backendProxyTarget,
          changeOrigin: true,
        },
        // Do not proxy /health: same-origin /health is handled by React Router → /admin/system-health.
        // JSON health: GET /api/health (proxied) or backend :3000/health directly.
      },
    },
    build: {
      outDir: 'dist',
      target: 'es2022',
      // Shopify/Cloudflare dev tunnels can refuse bursts of HTTP/2 modulepreload streams.
      // Let the browser discover chunks from the module graph instead of preloading every vendor chunk.
      modulePreload: false,
      assetsInlineLimit: 4096,
      // Disable sourcemaps in production for security and performance
      sourcemap: process.env.NODE_ENV !== 'production',
      minify: 'terser',
      // Keep esbuild CSS minification for performance; a known Polaris v12 custom-media warning is filtered above.
      cssMinify: 'esbuild',
      terserOptions: {
        compress: {
          drop_console: process.env.NODE_ENV === 'production', // Remove console.log in production
          drop_debugger: true,
        },
      },
      rollupOptions: {
        output: {
          // Code splitting for better caching. Disable with RIPX_DISABLE_MANUAL_CHUNKS=true
          // when debugging tunnel stream limits.
          manualChunks:
            process.env.RIPX_DISABLE_MANUAL_CHUNKS === 'true' ? undefined : resolveManualChunk,
        },
      },
      // Optimize chunk size
      chunkSizeWarningLimit: 1000,
    },
  };
});

