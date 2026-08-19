import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { DiscussionRepositoryError } from './errors'

// The port. Names the persistence the domain needs, and says nothing about how
// it is stored, so it imports no driver and stays safe to reach from shared
// code. The adapter in discussion-repository-live.ts is the only file with SQL.

export type DiscussionKind = 'question' | 'discussion'

export interface DiscussionRow {
  readonly id: string
  readonly lessonSlug: string
  readonly kind: DiscussionKind
  readonly title: string
  readonly body: string
  readonly authorId: string
  readonly acceptedReplyId: string | null
  readonly pinned: boolean
  readonly locked: boolean
  readonly replyCount: number
  readonly createdAt: number
  readonly lastReplyAt: number
}

// Written by hand rather than derived from DiscussionRow, so a caller cannot
// set pinned, locked, replyCount or acceptedReplyId at creation time.
export interface InsertDiscussion {
  readonly id: string
  readonly lessonSlug: string
  readonly kind: DiscussionKind
  readonly title: string
  readonly body: string
  readonly authorId: string
  readonly createdAt: number
  readonly lastReplyAt: number
}

// Offset paging rather than a cursor, because the list is small per lesson and
// the composite index already makes the order total. limit and offset are
// decided by the service, never taken raw from a client.
export interface ListDiscussions {
  readonly lessonSlug: string
  readonly limit: number
  readonly offset: number
}

// The author id is an input to the write, not something the caller checks
// first. Everything that decides whether the write is allowed goes in the
// WHERE clause, so there is no window between the check and the write.
export interface AcceptReply {
  readonly discussionId: string
  readonly replyId: string
  readonly authorId: string
}

export class DiscussionRepository extends Context.Service<
  DiscussionRepository,
  {
    // Returns the row or null rather than failing, because what a missing row
    // means is the service's decision, not the repository's.
    readonly findById: (
      id: string,
    ) => Effect.Effect<DiscussionRow | null, DiscussionRepositoryError>
    readonly insert: (
      discussion: InsertDiscussion,
    ) => Effect.Effect<void, DiscussionRepositoryError>
    // Ordered pinned first, then most recent activity, then id. The id is not
    // decoration: without it the order is not total, and a row sharing a
    // lastReplyAt with another can appear on two pages or on neither.
    readonly list: (
      options: ListDiscussions,
    ) => Effect.Effect<ReadonlyArray<DiscussionRow>, DiscussionRepositoryError>
    // Resolves true when the row was updated. False means some part of the
    // WHERE did not match, and the service decides which precise error that is
    // by re-checking the same conditions through rules.ts.
    readonly acceptReply: (
      input: AcceptReply,
    ) => Effect.Effect<boolean, DiscussionRepositoryError>
    // Moderation. No ownership in the WHERE, because who may call these is
    // decided by AdminMiddleware on the endpoint, not by the row. Each resolves
    // false when no such discussion exists, which the service turns into a 404.
    readonly setPinned: (
      id: string,
      pinned: boolean,
    ) => Effect.Effect<boolean, DiscussionRepositoryError>
    readonly setLocked: (
      id: string,
      locked: boolean,
    ) => Effect.Effect<boolean, DiscussionRepositoryError>
    readonly deleteById: (
      id: string,
    ) => Effect.Effect<boolean, DiscussionRepositoryError>
  }
>()('DiscussionRepository') {}
