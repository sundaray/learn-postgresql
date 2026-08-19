import * as Schema from 'effect/Schema'

// Errors about a discussion that more than one sub-domain has to raise. They
// live here rather than in discussion/errors.ts because the reply sub-domain
// needs them too, and a sub-domain never imports another sub-domain.
//
// The alternative was a second vocabulary on the reply side, which would have
// meant a client seeing DiscussionLockedError from one endpoint and something
// like ThreadLockedError from another for exactly the same condition. Shared
// contract belongs at the feature root, next to db/schema.ts, for the same
// reason that does.

export class DiscussionNotFoundError extends Schema.TaggedError<DiscussionNotFoundError>()(
  'DiscussionNotFoundError',
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

export class DiscussionLockedError extends Schema.TaggedError<DiscussionLockedError>()(
  'DiscussionLockedError',
  { id: Schema.String },
  { httpApiStatus: 409 },
) {}

// Raised by the auth middleware rather than by a sub-domain, so they live here
// with the other shared contract.

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  'UnauthorizedError',
  {},
  { httpApiStatus: 401 },
) {}

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
  'ForbiddenError',
  {},
  { httpApiStatus: 403 },
) {}
