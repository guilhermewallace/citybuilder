import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Local Overpass development proxies (avoids browser CORS issues with local Docker Overpass containers)
      proxy: {
        '/overpass-teresina': {
          target: process.env.OVERPASS_TERESINA_TARGET || 'http://localhost:12346',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/overpass-teresina/, ''),
        },
        '/overpass': {
          target: process.env.OVERPASS_LOCAL_TARGET || 'http://localhost:12345',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/overpass/, ''),
        },
      },
    },
  };
});
