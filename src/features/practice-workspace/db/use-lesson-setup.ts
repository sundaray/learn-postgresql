import { useCallback, useEffect, useState } from 'react'
import { Result } from 'better-result'

import { LessonSetupFailed, describeCause } from './errors'
import type { PracticeDatabase } from './practice-database'

type LessonSetupResult =
  | {
      status: 'idle' | 'applying' | 'applied'
      error: null
    }
  | {
      status: 'error'
      error: Error
    }

export type LessonSetupState = LessonSetupResult & {
  reapply: () => void
}

export type LessonSetupStatus = LessonSetupState['status']

/** Applies a lesson's optional database setup when the lesson is opened. */
export function useLessonSetup(
  database: PracticeDatabase | null,
  setupSql: string,
): LessonSetupState {
  const [result, setResult] = useState<LessonSetupResult>({
    status: 'idle',
    error: null,
  })
  const [attempt, setAttempt] = useState(0)

  const reapply = useCallback(() => {
    setAttempt((previous) => previous + 1)
  }, [])

  useEffect(() => {
    if (!database) {
      setResult({ status: 'idle', error: null })
      return
    }

    if (!setupSql.trim()) {
      setResult({ status: 'applied', error: null })
      return
    }

    let active = true
    setResult({ status: 'applying', error: null })

    void Result.tryPromise({
      try: () => database.exec(setupSql),
      catch: (cause) =>
        new LessonSetupFailed({ cause, message: describeCause(cause) }),
    }).then((setupResult) => {
      if (!active) {
        return
      }

      setResult(
        setupResult.match({
          ok: (): LessonSetupResult => ({ status: 'applied', error: null }),
          err: (error): LessonSetupResult => ({ status: 'error', error }),
        }),
      )
    })

    return () => {
      active = false
    }
  }, [database, setupSql, attempt])

  return { ...result, reapply }
}
