import { useEffect, useState } from 'react'
import { Result } from 'better-result'

import { DatabaseStartFailed, describeCause } from './errors'
import { createPracticeDatabase } from './practice-database'
import type { PracticeDatabase } from './practice-database'

export type PracticeDatabaseState =
  | {
      status: 'starting'
      database: null
      error: null
      isLeader: false
    }
  | {
      status: 'ready'
      database: PracticeDatabase
      error: null
      isLeader: boolean
    }
  | {
      status: 'error'
      database: null
      error: Error
      isLeader: false
    }

export type PracticeDatabaseStatus = PracticeDatabaseState['status']

const startingState: PracticeDatabaseState = {
  status: 'starting',
  database: null,
  error: null,
  isLeader: false,
}

export function usePracticeDatabase(): PracticeDatabaseState {
  const [state, setState] = useState<PracticeDatabaseState>(startingState)

  useEffect(() => {
    let active = true
    const database = createPracticeDatabase()

    const unsubscribe = database.onLeaderChange(() => {
      if (active) {
        setState((previous) =>
          previous.status === 'ready'
            ? { ...previous, isLeader: database.isLeader }
            : previous,
        )
      }
    })

    void Result.tryPromise({
      try: () => database.waitReady,
      catch: (cause) =>
        new DatabaseStartFailed({ cause, message: describeCause(cause) }),
    }).then((readyResult) => {
      if (!active) {
        return
      }

      setState(
        readyResult.match({
          ok: (): PracticeDatabaseState => ({
            status: 'ready',
            database,
            error: null,
            isLeader: database.isLeader,
          }),
          err: (error): PracticeDatabaseState => ({
            status: 'error',
            database: null,
            error,
            isLeader: false,
          }),
        }),
      )
    })

    return () => {
      active = false
      unsubscribe()
      void database.close()
    }
  }, [])

  return state
}
