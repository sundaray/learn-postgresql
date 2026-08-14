import type { LessonPlan, LessonStepPlan } from '@/features/lessons'

import type { CompletionCheck } from '../db/completion'
import type { QueryRun } from '../db/run-query'
import type { DatabasePreview } from '../model/practice-workspace.types'

export type WorkspaceLayoutProps = {
  database: DatabasePreview
  lesson: LessonPlan
  activeStepId: string | null
  sql: string
  onLoadStep: (step: LessonStepPlan) => void
  onSqlChange: (sql: string) => void
  onRunSql: () => void
  isExecutionAvailable: boolean
  isRunning: boolean
  run: QueryRun | null
  checks: readonly CompletionCheck[]
}
