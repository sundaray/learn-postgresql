import { configDefaults, defineConfig } from 'vitest/config'

// The Node runner: pure rules, services over in-memory fakes, and middleware
// driven with hand-built Requests. Nothing here may touch a database.
//
// Tests are co-located beside the code they cover, so the runner a file belongs
// to is decided by its suffix rather than its directory. `.workers.test.ts` and
// `.browser.test.tsx` belong to the other two configs and are excluded here.
export default defineConfig({
  resolve: {
    // Picks up the `@/*` and `content-collections` paths from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    name: 'node',
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      ...configDefaults.exclude,
      'src/**/*.workers.test.ts',
      'src/**/*.browser.test.tsx',
    ],
    restoreMocks: true,
  },
})
