import { applyD1Migrations } from 'cloudflare:test'

import { testEnv } from './test-env'

// Runs once per test file. vitest.workers.config.ts reads migrations/ in Node
// and passes the parsed result through a binding, because the worker has no
// filesystem. The workers pool isolates storage per file rather than per test,
// so this gives each file an empty, fully migrated database and leaves seeding
// to the tests.
await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS)
