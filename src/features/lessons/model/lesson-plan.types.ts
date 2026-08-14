export type LessonFormat = 'guided-lab' | 'concept-lab' | 'challenge'

export type LessonStepKind =
  | 'read'
  | 'run'
  | 'change'
  | 'compare'
  | 'reflect'

export type QueryPlanNode =
  | 'Seq Scan'
  | 'Index Scan'
  | 'Index Only Scan'
  | 'Bitmap Index Scan'
  | 'Bitmap Heap Scan'
  | 'Sort'
  | 'Incremental Sort'

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

export type LessonStatement =
  | 'ANALYZE'
  | 'VACUUM'
  | 'EXPLAIN'
  | 'SELECT'
  | 'CREATE INDEX'
  | 'DROP INDEX'

export type LessonCompletionRule =
  | {
      kind: 'statement-executed'
      statement: LessonStatement
    }
  | {
      kind: 'plan-node'
      anyOf: NonEmptyReadonlyArray<QueryPlanNode>
      relation?: string
      advisory?: boolean
    }
  | {
      kind: 'plan-uses-index'
      indexName: string
      anyOf: NonEmptyReadonlyArray<QueryPlanNode>
      advisory?: boolean
    }
  | {
      kind: 'index-exists'
      indexName: string
    }
  | {
      kind: 'index-absent'
      indexName: string
    }
  | {
      kind: 'manual-reflection'
      prompt: string
    }

export type LessonStepPlan = {
  id: string
  order: number
  kind: LessonStepKind
  title: string
  instruction: string[]
  sql?: string
  solutionSql?: string
  expectedObservations: string[]
  explanation: string[]
  completion: LessonCompletionRule[]
  hint?: string
  caution?: string
}

export type LessonDatabaseState = {
  datasetId: string
  setupSql: string
  notes: string[]
}

export type InterviewCheck = {
  question: string
  answerPoints: string[]
}

export type LessonSection = {
  title: string
  paragraphs: string[]
}

/** Identifies a diagram component rendered by the lesson panel. */
export type LessonDiagramId = 'sql-execution-stages'

export type LessonPlan = {
  id: string
  slug: string
  order: number
  title: string
  introduction: string[]
  introDiagram?: LessonDiagramId
  sections?: LessonSection[]
  category?: string
  summary?: string
  estimatedMinutes?: number
  format?: LessonFormat
  learningObjectives?: string[]
  concepts?: string[]
  prerequisites?: string[]
  databaseState?: LessonDatabaseState
  steps?: LessonStepPlan[]
  takeaways?: string[]
  interviewChecks?: InterviewCheck[]
}

export type DatasetTablePlan = {
  name: string
  approximateRows: number
  columns: string[]
  purpose: string
}

export type CourseDatasetPlan = {
  id: string
  name: string
  description: string
  tables: DatasetTablePlan[]
  distributions: string[]
  requirements: string[]
}

export type CoursePlan = {
  id: string
  slug: string
  title: string
  summary: string
  description: string[]
  learningOutcomes: string[]
  dataset: CourseDatasetPlan
  lessons: LessonPlan[]
}
