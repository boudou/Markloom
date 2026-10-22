import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** Writes pwa/sw.js into the build as sw.js, with this version in its cache name */
function serviceWorker(): Plugin {
  return {
    name: 'markloom-service-worker',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8').replaceAll('__VERSION__', version);

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/release/**', '**/build/**'],
    },
  },
  build: {
    outDir: 'dist',
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
