import * as Filter from 'effect/Filter'
import * as Result from 'effect/Result'

import type { DiscussionRow } from './discussion-repository'

// Pure predicates over a row and an actor. No service, no Layer, no I/O, so
// these are called directly in tests.
//
// A rule returns a reason rather than a boolean, which is what effect/Filter is
// for: Filter<Input, Pass, Fail> is (input) => Result<Pass, Fail>, so the
// passing value is narrowed and the failing value says why. The service maps
// each reason to a typed domain error, which is how a caller gets "you are not
// the author" instead of "zero rows affected".
//
// The repository puts the same conditions in its WHERE clause. That is not
// duplication for its own sake: the WHERE is what closes the window between
// checking and writing, and these are what turn a write that matched nothing
// into a precise answer.

export type AcceptReplyRefusal = 'not-author' | 'not-a-question' | 'locked'

export interface AcceptReplyInput {
  readonly discussion: DiscussionRow
  readonly actorId: string
}

// Order matters and is pinned by a test. Identity first, because "you are not
// the author" is the honest answer to a stranger whatever else is true of the
// row. Then the kind, then the state.
export const canAcceptReply: Filter.Filter<
  AcceptReplyInput,
  DiscussionRow,
  AcceptReplyRefusal
> = Filter.make(({ discussion, actorId }) => {
  if (discussion.authorId !== actorId) return Result.fail('not-author')
  if (discussion.kind !== 'question') return Result.fail('not-a-question')
  if (discussion.locked) return Result.fail('locked')
  return Result.succeed(discussion)
})

export interface PageRequest {
  readonly page: number
  readonly pageSize: number
}

// Pages are one-based for the reader and zero-based for SQL. Clamped because a
// negative OFFSET is a SQL error rather than an empty page, and this is the last
// point before the value reaches the query.
export function pageOffset({ page, pageSize }: PageRequest): number {
  return Math.max(0, page - 1) * pageSize
}
