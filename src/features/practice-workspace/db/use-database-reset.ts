import { useCallback, useRef, useState } from 'react'
import { Result } from 'better-result'

import { DatabaseResetFailed, describeCause } from './errors'
import type { PracticeDatabase } from './practice-database'
import { resetDatabase } from './seed'

export type DatabaseResetStatus = 'idle' | 'resetting'

export type DatabaseResetState = {
  status: DatabaseResetStatus
  error: Error | null
  /** Resolves to whether the seeded rows are back in place. */
  reset: () => Promise<boolean>
}

/** Puts the practice database back to its seeded state on demand. */
export function useDatabaseReset(
  database: PracticeDatabase | null,
): DatabaseResetState {
  const [status, setStatus] = useState<DatabaseResetStatus>('idle')
  const [error, setError] = useState<Error | null>(null)
  const inFlightRef = useRef(false)

  const reset = useCallback(async () => {
    if (!database || inFlightRef.current) {
      return false
    }

    inFlightRef.current = true
    setStatus('resetting')
    setError(null)

    const resetResult = await Result.tryPromise({
      try: () => resetDatabase(database),
      catch: (cause) =>
        new DatabaseResetFailed({ cause, message: describeCause(cause) }),
    })

    inFlightRef.current = false
    setStatus('idle')

    if (Result.isError(resetResult)) {
      setError(resetResult.error)
      return false
    }

    return true
  }, [database])

  return { status, error, reset }
}
