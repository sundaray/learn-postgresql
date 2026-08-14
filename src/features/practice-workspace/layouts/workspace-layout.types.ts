import type { LessonPlan, LessonStepPlan } from '@/features/lessons'

import type { QueryRun } from '../db/run-query'
import type {
  DatabaseSchema,
  WorkspaceFailure,
  WorkspaceStatus,
} from '../model/practice-workspace.types'

export type WorkspaceLayoutProps = {
  schema: DatabaseSchema
  status: WorkspaceStatus
  failure: WorkspaceFailure | null
  runBlockedReason: string | null
  lesson: LessonPlan
  activeStepId: string | null
  sql: string
  onLoadStep: (step: LessonStepPlan) => void
  onLoadSnippet: (sql: string) => void
  onSqlChange: (sql: string) => void
  onRunSql: () => void
  isRunning: boolean
  run: QueryRun | null
}
