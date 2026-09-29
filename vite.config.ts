import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
        // monaco-editor >=0.55 no longer exposes `esm/vs/...` through its exports map,
        // but y-monaco imports `monaco-editor/esm/vs/editor/editor.api.js` directly.
        { find: /^monaco-editor\/esm\/vs\//, replacement: path.resolve(__dirname, 'node_modules/monaco-editor/esm/vs') + '/' },
      ],
    },
    // simple-peer (used by y-webrtc) expects Node's `global`.
    define: {
      global: 'globalThis',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
