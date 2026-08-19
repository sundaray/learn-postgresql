import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The browser runner: React components in real Chromium, so every AsyncResult
// branch, the hydration path, and the pending states of a form are observed the
// way a reader would see them rather than through a DOM shim.
//
// It loads React and Tailwind but deliberately not tanstackStart(), whose SSR
// plugin fights browser mode.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [viteReact(), tailwindcss()],
  // Pre-bundle these up front. Otherwise Vite discovers and optimizes a dep on
  // its first import mid-run, and that reload swaps the module while a
  // component is rendering, which breaks React context identity. It shows up as
  // useContext crashes inside providers rather than as anything to do with
  // bundling. Extend this list as component tests bring in more packages.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'vitest-browser-react',
    ],
  },
  test: {
    name: 'browser',
    include: ['src/**/*.browser.test.tsx'],
    restoreMocks: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      // Browser mode defaults to a 414px-wide phone viewport. This app is a
      // desktop-first workspace, so a test that says nothing about layout
      // should run against the desk rather than silently against phone chrome.
      // A test that cares about a narrower width sets it with page.viewport().
      viewport: { width: 1280, height: 800 },
      instances: [{ browser: 'chromium' }],
    },
  },
})
