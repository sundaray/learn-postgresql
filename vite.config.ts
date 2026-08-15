import { tanstackStart } from '@tanstack/react-start/plugin/vite'
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
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    // Alchemy's injected plugin enables SSR asset emission. The client build
    // already owns those static assets, so restore Vite's non-client default
    // after every plugin has contributed its environment configuration.
    keepClientAssetsOutOfSsr,
  ],
})
