import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as SchemaIssue from 'effect/SchemaIssue'
import { HttpApiMiddleware } from 'effect/unstable/httpapi'

// An endpoint with a `payload` schema already rejects bad input before the
// handler runs, but on its own that is a blank 400 with nothing a form can put
// beside the input that caused it. This turns the decode failure into one
// { field, message } per failure.
//
// No server-only imports, so it stays reachable from api.ts.
//
// One thing to know before designing a form against this: HttpApiBuilder
// decodes the payload with the default parse options, which stop at the first
// failure, and the transform is handed the resulting SchemaError with no way to
// re-run the decode. So a response carries one field at a time even though the
// error's shape is a list. A form should show what it is given rather than
// assume it has every problem with the submission.

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  'ValidationError',
  {
    fields: Schema.Array(
      Schema.Struct({ field: Schema.String, message: Schema.String }),
    ),
  },
  { httpApiStatus: 400 },
) {}

export class ValidationMiddleware extends HttpApiMiddleware.Service<
  ValidationMiddleware,
  { provides: never; requires: never }
>()('forum/ValidationMiddleware', { error: ValidationError }) {}

export interface ValidationField {
  readonly field: string
  readonly message: string
}

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1()

/**
 * The path of one Standard Schema issue as a dotted field name.
 *
 * Segments are either a plain key or a `{ key }` object. Anything else, such as
 * a symbol key, has no name a form input could match, so it reports as the
 * whole payload rather than as a field that does not exist.
 */
function dotPath(path: ReadonlyArray<PropertyKey | { key: PropertyKey }>) {
  const segments: string[] = []

  for (const segment of path) {
    const key =
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? segment.key
        : segment

    if (typeof key !== 'string' && typeof key !== 'number') return ''

    segments.push(String(key))
  }

  return segments.join('.')
}

/**
 * Flattens a decode failure into one entry per failing field. Exported on its
 * own, and not buried in the layer, so it is an ordinary unit test over a real
 * decode failure rather than something that needs a server.
 */
export function validationFields(
  error: Schema.SchemaError,
): ReadonlyArray<ValidationField> {
  const issue = error.issue

  // A bare string issue carries no path, so there is no field to blame and it
  // describes the payload as a whole.
  if (typeof issue === 'string') return [{ field: '', message: issue }]

  return formatIssues(issue).issues.map((entry) => ({
    field: dotPath(entry.path ?? []),
    message: entry.message,
  }))
}

export const ValidationMiddlewareLive =
  HttpApiMiddleware.layerSchemaErrorTransform(
    ValidationMiddleware,
    (schemaError) =>
      Effect.fail(new ValidationError({ fields: validationFields(schemaError.cause) })),
  )
