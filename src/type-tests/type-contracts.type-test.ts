import type {
  LessonStatement,
  NonEmptyReadonlyArray,
} from '@/features/lessons'
import type { StatementLabel } from '@/features/practice-workspace/db/run-query'
import type { LessonSetupState } from '@/features/practice-workspace/db/use-lesson-setup'
import type { WorkspaceView } from '@/features/practice-workspace/model/practice-workspace.types'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false

type Expect<Value extends true> = Value

type ExpectedLessonStatements =
  | 'ANALYZE'
  | 'VACUUM'
  | 'EXPLAIN'
  | 'SELECT'
  | 'CREATE INDEX'
  | 'DROP INDEX'

export type TypeContractTests = [
  Expect<Equal<WorkspaceView, 'lesson' | 'code' | 'output'>>,
  Expect<Equal<LessonStatement, ExpectedLessonStatements>>,
  Expect<Equal<Exclude<StatementLabel, 'OTHER'>, LessonStatement>>,
  Expect<Equal<Extract<StatementLabel, 'OTHER'>, 'OTHER'>>,
  Expect<Equal<[] extends NonEmptyReadonlyArray<string> ? true : false, false>>,
  Expect<Equal<['value'] extends NonEmptyReadonlyArray<string> ? true : false, true>>,
  Expect<Equal<Extract<LessonSetupState, { status: 'error' }>['error'], Error>>,
  Expect<
    Equal<
      Exclude<LessonSetupState, { status: 'error' }>['error'],
      null
    >
  >,
]
