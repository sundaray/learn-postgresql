import * as Filter from 'effect/Filter'
import * as Result from 'effect/Result'

import type { ParentDiscussion } from './reply-repository'

export type ReplyRefusal = 'locked'

// Any signed-in reader may reply, so authorship grants nothing here and the only
// thing that can refuse is the thread being locked.
//
// The repository does not also carry this in a WHERE clause, unlike acceptReply.
// The race it would close is a reply landing on a discussion locked a moment
// earlier, which costs one straggler post rather than an authorization failure.
// If locking ever needs to be exact, the insert becomes conditional the same way
// acceptReply is.
export const canReply: Filter.Filter<
  ParentDiscussion,
  ParentDiscussion,
  ReplyRefusal
> = Filter.make((parent) =>
  parent.locked ? Result.fail('locked') : Result.succeed(parent),
)
