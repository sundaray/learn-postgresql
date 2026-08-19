import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { env } from 'cloudflare:workers'

// The workerd runner hands tests bindings the deployed worker does not have,
// TEST_MIGRATIONS being the first. Declaring them by augmenting Cloudflare.Env
// would put a test-only binding on the app's Env type everywhere, so feature
// code could read it and type-check against something that is undefined in
// production. One narrow view, cast once, keeps that from happening.
export interface TestEnv {
  readonly DB: D1Database
  readonly TEST_MIGRATIONS: D1Migration[]
}

export const testEnv = env as unknown as TestEnv
