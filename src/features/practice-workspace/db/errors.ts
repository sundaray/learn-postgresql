import { TaggedError } from 'better-result'

import { readPostgresError } from './postgres-error'

/** A statement sent to PGlite was rejected by PostgreSQL. */
export class StatementFailed extends TaggedError('StatementFailed')<{
  cause: unknown
  severity: string
  message: string
  detail: string | null
  hint: string | null
  position: number | null
}> {}

/** The PGlite instance never reached a ready state. */
export class DatabaseStartFailed extends TaggedError('DatabaseStartFailed')<{
  cause: unknown
  message: string
}> {}

/** Rebuilding the seeded database from the workspace failed part way. */
export class DatabaseResetFailed extends TaggedError('DatabaseResetFailed')<{
  cause: unknown
  message: string
}> {}

/** A lesson's setup SQL could not be applied to the practice database. */
export class LessonSetupFailed extends TaggedError('LessonSetupFailed')<{
  cause: unknown
  message: string
}> {}

/** The information_schema lookup that feeds editor autocomplete failed. */
export class SchemaUnavailable extends TaggedError('SchemaUnavailable')<{
  cause: unknown
  message: string
}> {}

/**
 * Reads a human-readable message from an unknown thrown value, unpacking the
 * fields the worker had to fold into the message.
 */
export function describeCause(cause: unknown): string {
  return readPostgresError(cause).message
}
