import * as Schema from 'effect/Schema'

// A missing or locked parent is described by the shared discussion errors, so
// a client sees one vocabulary whichever endpoint refused it.
export {
  DiscussionLockedError,
  DiscussionNotFoundError,
} from '@/features/forum/errors'

export class ReplyRepositoryError extends Schema.TaggedError<ReplyRepositoryError>()(
  'ReplyRepositoryError',
  { cause: Schema.String },
) {}

export class ReplyNotFoundError extends Schema.TaggedError<ReplyNotFoundError>()(
  'ReplyNotFoundError',
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}
