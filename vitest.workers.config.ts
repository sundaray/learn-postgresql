import * as path from 'node:path'

import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// The workerd runner: everything that needs a real D1 database. Repository
// adapters, cascade deletes, CHECK constraints, db.batch atomicity, and the
// full-stack tests that drive the worker with raw Requests.
//
// readD1Migrations runs here, in Node, because it reads the migrations/
// directory off disk. The parsed migrations are handed to the worker through a
// binding, and the setup file applies them to the D1 database each test file
// gets. Storage is isolated per test FILE, not per test, so the setup runs once
// per file and tests seed their own unique fixtures on top.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, 'migrations'),
  )

  return {
    resolve: {
      // Picks up the `@/*` and `content-collections` paths from tsconfig.json,
      // the same as the other two runners. Without it every test that imports
      // a feature module by its alias fails to resolve.
      tsconfigPaths: true,
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.test.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      name: 'workers',
      include: ['src/**/*.workers.test.ts'],
      setupFiles: ['./src/test-support/apply-d1-migrations.ts'],
      restoreMocks: true,
    },
  }
})
