import { createClientOnlyFn } from '@tanstack/react-start'

export const createPracticeDatabase = createClientOnlyFn(async () => {
  const { createPracticeDatabaseClient } = await import(
    './practice-database.client'
  )

  return createPracticeDatabaseClient()
})

export type PracticeDatabase = Awaited<
  ReturnType<typeof createPracticeDatabase>
>
