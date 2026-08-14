import { useCallback, useRef, useState } from 'react'

import type { PracticeDatabase } from './practice-database'
import { runQuery } from './run-query'
import type { QueryRun } from './run-query'

export type QueryRunnerStatus = 'idle' | 'running'

export type QueryRunnerState = {
  status: QueryRunnerStatus
  lastRun: QueryRun | null
  run: (sql: string) => Promise<void>
  clear: () => void
}

export function useQueryRunner(
  database: PracticeDatabase | null,
): QueryRunnerState {
  const [status, setStatus] = useState<QueryRunnerStatus>('idle')
  const [lastRun, setLastRun] = useState<QueryRun | null>(null)
  const inFlightRef = useRef(false)
  const runVersionRef = useRef(0)

  const run = useCallback(
    async (sql: string) => {
      if (!database || inFlightRef.current || !sql.trim()) {
        return
      }

      inFlightRef.current = true
      const runVersion = ++runVersionRef.current
      setStatus('running')

      try {
        const result = await runQuery(database, sql)

        if (runVersionRef.current === runVersion) {
          setLastRun(result)
        }
      } finally {
        inFlightRef.current = false
        setStatus('idle')
      }
    },
    [database],
  )

  const clear = useCallback(() => {
    runVersionRef.current += 1
    setLastRun(null)
  }, [])

  return { status, lastRun, run, clear }
}
