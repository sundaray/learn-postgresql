export type LessonFormat = 'guided-lab' | 'concept-lab' | 'challenge'

export type LessonStepKind =
  | 'read'
  | 'run'
  | 'change'
  | 'compare'
  | 'reflect'

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]]

export type LessonStatement =
  | 'ANALYZE'
  | 'VACUUM'
  | 'EXPLAIN'
  | 'SELECT'
  | 'CREATE INDEX'
  | 'DROP INDEX'

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

export type LessonListItem = {
  paragraphs: string[]
}

export type LessonContentBlock =
  | {
      type: 'paragraph'
      text: string
    }
  | {
      type: 'note'
      text: string
    }
  | {
      type: 'unordered-list'
      items: LessonListItem[]
    }
  | {
      type: 'ordered-list'
      items: LessonListItem[]
    }
  | {
      type: 'code'
      language: 'sql' | 'text'
      contents: string
    }

export type LessonSection = {
  title: string
  paragraphs?: string[]
  content?: LessonContentBlock[]
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
  content?: LessonContentBlock[]
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
