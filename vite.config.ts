import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA. `base: './'` makes the built bundle path-relative so it can be
// dropped into any static host (or served from a subfolder) without config.
// All assets are bundled — no external CDNs.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5178, strictPort: true },
  build: {
    target: 'es2020',
    // dist/ is reserved for the committed HACS plugin bundle (see
    // vite.hacs.config.ts); the static app site builds to dist-app/.
    outDir: 'dist-app',
    assetsInlineLimit: 0,
    // The full MDI icon set is large but must be bundled (offline, no CDN).
    // Split it into its own chunk so it caches independently of app code.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: { mdi: ['@mdi/js'] },
      },
    },
  },
});
