import * as Schema from 'effect/Schema'

// Shared with the reply sub-domain, so they live at the feature root. Re-exported
// here so this sub-domain still has one import site for its errors.
export {
  DiscussionLockedError,
  DiscussionNotFoundError,
} from '@/features/forum/errors'

// Every driver failure the adapter sees becomes this, so a raw exception never
// escapes the repository. Endpoint handlers turn it into a defect with
// Effect.die, which makes a broken database an opaque 500 rather than part of
// the API contract.
export class DiscussionRepositoryError extends Schema.TaggedError<DiscussionRepositoryError>()(
  'DiscussionRepositoryError',
  { cause: Schema.String },
) {}

// Domain errors. These are part of the API contract, so each carries the status
// the client sees. DiscussionRepositoryError deliberately does not: a broken
// database becomes a defect, not a documented response.

export class NotAuthorError extends Schema.TaggedError<NotAuthorError>()(
  'NotAuthorError',
  { id: Schema.String },
  { httpApiStatus: 403 },
) {}

export class NotAQuestionError extends Schema.TaggedError<NotAQuestionError>()(
  'NotAQuestionError',
  { id: Schema.String },
  { httpApiStatus: 409 },
) {}
