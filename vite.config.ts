import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression2';

export default defineConfig({
  base: './',
  plugins: [
    compression({ algorithms: ['gzip'], exclude: [/\.(glb|ogg|mp4|webp|ktx2)$/] }),
  ],
  resolve: {
    alias: {
      '@core':    '/src/core',
      '@entities':'/src/entities',
      '@combat':  '/src/combat',
      '@ai':      '/src/ai',
      '@vfx':     '/src/vfx',
      '@ui':      '/src/ui',
      '@scene':   '/src/scene',
      '@config':  '/src/config',
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  assetsInclude: ['**/*.glb', '**/*.ktx2'],
  optimizeDeps: {
    include: ['three'],
  },
});
