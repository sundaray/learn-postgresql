import { expect, it } from 'vitest'

import { drizzle } from 'drizzle-orm/d1'

import { user } from '@/features/auth/server/schema'

import { testEnv } from './test-env'

// Proves the workerd runner boots with everything step 5 will rest on: the D1
// binding from wrangler.test.jsonc, migrations applied by the setup file, the
// `@/*` alias resolving, and drizzle-orm/d1 able to query through the binding.
// Delete once real repository tests exist.
it('has a migrated D1 database', async () => {
  const { results } = await testEnv.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all<{ name: string }>()

  const tableNames = results.map((row) => row.name)

  expect(tableNames).toContain('d1_migrations')
  expect(tableNames).toContain('user')
})

it('queries that database through drizzle and the @/ alias', async () => {
  const db = drizzle(testEnv.DB)

  await expect(db.select().from(user)).resolves.toEqual([])
})
