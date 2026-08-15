import { Result, TaggedError } from 'better-result'

/** A message that opened like the worker envelope but did not parse as one. */
class EnvelopeUnreadable extends TaggedError('EnvelopeUnreadable')<{
  cause: unknown
}> {}

/** The PostgreSQL error fields a psql client prints. */
export type PostgresError = {
  severity: string
  message: string
  detail: string | null
  hint: string | null
  position: number | null
}

/**
 * PGlite's worker bridge rejects with `{ message }` and nothing else, so the
 * other fields have to travel inside the message and be unpacked in the tab.
 */
const envelopeKey = '__pgliteErrorFields'

function readText(error: unknown, field: string): string | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const value = (error as Record<string, unknown>)[field]

  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function readPosition(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const candidate = (error as { position?: unknown }).position

  if (typeof candidate === 'number') return candidate
  if (typeof candidate === 'string') {
    const parsed = Number.parseInt(candidate, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

/** Reads the fields PGlite hangs on the thrown DatabaseError. */
function readFields(cause: unknown, message: string): PostgresError {
  return {
    severity: readText(cause, 'severity') ?? 'ERROR',
    message,
    detail: readText(cause, 'detail'),
    hint: readText(cause, 'hint'),
    position: readPosition(cause),
  }
}

function decodeEnvelope(message: string): PostgresError | null {
  if (!message.startsWith(`{"${envelopeKey}"`)) return null

  const parsed = Result.try({
    try: (): unknown => JSON.parse(message),
    catch: (cause) => new EnvelopeUnreadable({ cause }),
  })

  if (Result.isError(parsed)) return null

  const fields =
    typeof parsed.value === 'object' && parsed.value !== null
      ? (parsed.value as Record<string, unknown>)[envelopeKey]
      : null

  return typeof fields === 'object' && fields !== null
    ? (fields as PostgresError)
    : null
}

/** Packs every field into one string, for the worker side of the bridge. */
export function encodePostgresError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)

  return JSON.stringify({ [envelopeKey]: readFields(cause, message) })
}

/**
 * Recovers the fields in the tab. Handles both sides: a message packed by the
 * worker, and an error thrown by a PGlite instance running in this thread.
 */
export function readPostgresError(cause: unknown): PostgresError {
  const message = cause instanceof Error ? cause.message : String(cause)

  return decodeEnvelope(message) ?? readFields(cause, message)
}
