import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { ReplyRepositoryError } from './errors'

export interface ReplyRow {
  readonly id: string
  readonly discussionId: string
  readonly body: string
  readonly authorId: string
  readonly createdAt: number
}

export interface InsertReply {
  readonly id: string
  readonly discussionId: string
  readonly body: string
  readonly authorId: string
  readonly createdAt: number
}

// The minimal view of a parent thread the reply side needs. Deliberately not
// DiscussionRow: the reply sub-domain owns this shape so it does not depend on
// the discussion sub-domain's types.
export interface ParentDiscussion {
  readonly id: string
  readonly locked: boolean
}

export interface ListReplies {
  readonly discussionId: string
  readonly limit: number
  readonly offset: number
}

export class ReplyRepository extends Context.Service<
  ReplyRepository,
  {
    // Writes the reply and the parent's denormalized counters together. The
    // caller cannot end up with one without the other.
    readonly insert: (
      reply: InsertReply,
    ) => Effect.Effect<void, ReplyRepositoryError>
    // Oldest first, which is how a thread reads. Carries id as the tiebreaker
    // for the same total-order reason as the discussion list.
    readonly listByDiscussion: (
      options: ListReplies,
    ) => Effect.Effect<ReadonlyArray<ReplyRow>, ReplyRepositoryError>
    readonly deleteById: (
      id: string,
    ) => Effect.Effect<boolean, ReplyRepositoryError>
    // Null when no such discussion exists, which the service turns into a 404
    // rather than a confusing "cannot reply".
    readonly findParent: (
      discussionId: string,
    ) => Effect.Effect<ParentDiscussion | null, ReplyRepositoryError>
  }
>()('ReplyRepository') {}
