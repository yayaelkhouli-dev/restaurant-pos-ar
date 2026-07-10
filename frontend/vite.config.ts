import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(),
    tsconfigPaths()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        // Backend runs on the same machine as the Vite server; keep this pointed
        // at localhost. LAN terminals reach it by proxying through this server.
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Same proxy for `vite preview` (serving the production build), so the built
  // app works identically on the LAN without a separate web server.
  preview: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Source maps ship the original TypeScript to anyone who opens devtools on a
    // customer's machine. This code gets sold; keep the source out of the build.
    // Set VITE_SOURCEMAP=true when you genuinely need to debug a production build.
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['@tanstack/react-router'],
          query: ['@tanstack/react-query'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'],
  },
})

