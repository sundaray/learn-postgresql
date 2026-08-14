import { live } from '@electric-sql/pglite/live'
import { PGliteWorker } from '@electric-sql/pglite/worker'

// Bump when the seeded schema or data changes; a new name forces a fresh
// IndexedDB store instead of reusing a database the seed guard would skip.
export const practiceDatabaseName = 'postgres-interview-lab-v2'

export function createPracticeDatabase() {
  return new PGliteWorker(
    new Worker(new URL('./pglite-worker.ts', import.meta.url), {
      type: 'module',
      name: 'practice-workspace-pglite',
    }),
    {
      id: 'practice-workspace',
      dataDir: `idb://${practiceDatabaseName}`,
      extensions: { live },
    },
  )
}

export type PracticeDatabase = ReturnType<typeof createPracticeDatabase>
