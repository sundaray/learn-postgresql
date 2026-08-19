import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import contentCollections from '@content-collections/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const keepClientAssetsOutOfSsr = {
  name: 'learn-postgresql:keep-client-assets-out-of-ssr',
  configEnvironment: {
    order: 'post',
    handler(name, config) {
      if (name === 'ssr') {
        config.build ??= {}
        config.build.emitAssets = false
      }
    },
  },
} satisfies Plugin

export default defineConfig({
  build: {
    // The auth server code reads its D1 binding from the Cloudflare runtime.
    // That module only exists inside the worker, so the bundler has to leave
    // the import alone instead of trying to resolve it from node_modules.
    rolldownOptions: {
      external: ['cloudflare:workers'],
    },
  },
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es',
  },
  plugins: [
    // Builds src/content/blog into the typed `content-collections` module the
    // blog routes import, and rebuilds it on change during dev.
    contentCollections(),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    // Alchemy's injected plugin enables SSR asset emission. The client build
    // already owns those static assets, so restore Vite's non-client default
    // after every plugin has contributed its environment configuration.
    keepClientAssetsOutOfSsr,
  ],
})
