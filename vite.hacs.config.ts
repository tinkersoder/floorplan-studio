import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build the HACS/Lovelace plugin: one self-contained ES module that registers
// the <floorplan-studio-card> custom element. Everything (React, the full MDI
// set, CSS) is inlined into a single file so HACS can serve it as one resource.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    target: 'es2020',
    outDir: 'dist-hacs',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/hacs-card.tsx',
      formats: ['es'],
      fileName: () => 'floorplan-studio.js',
    },
    rollupOptions: {
      // One file — inline the MDI dynamic chunk instead of code-splitting.
      output: { inlineDynamicImports: true },
    },
  },
});
