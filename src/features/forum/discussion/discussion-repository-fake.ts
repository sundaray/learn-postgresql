import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import type {
  AcceptReply,
  DiscussionRow,
  InsertDiscussion,
  ListDiscussions,
} from './discussion-repository'
import { DiscussionRepository } from './discussion-repository'

// An in-memory stand-in for the real adapter, used by the service tests so
// business rules keep a sub-second watch loop.
//
// It implements the whole port. That is the point: it is compile-checked
// against the same interface, so adding a method to the port breaks this file
// rather than letting the fake quietly fall behind what production does.
//
// It is not a second implementation of the SQL. Ordering and constraint
// behaviour are proved against real D1 in the workers tests; what this exists
// for is letting a rule be exercised without a database.

export interface DiscussionRepositoryFake {
  readonly layer: Layer.Layer<DiscussionRepository>
  readonly rows: Map<string, DiscussionRow>
  readonly replyParents: Map<string, string>
}

export function makeDiscussionRepositoryFake(options?: {
  readonly seed?: ReadonlyArray<DiscussionRow>
  // Reply id to the discussion it belongs to, so acceptReply can mirror the
  // real adapter's check that a reply is not borrowed from another thread.
  readonly replyParents?: Readonly<Record<string, string>>
}): DiscussionRepositoryFake {
  const rows = new Map<string, DiscussionRow>(
    (options?.seed ?? []).map((row) => [row.id, row]),
  )
  const replyParents = new Map<string, string>(
    Object.entries(options?.replyParents ?? {}),
  )

  const layer = Layer.succeed(DiscussionRepository, {
    findById: (id: string) => Effect.succeed(rows.get(id) ?? null),

    insert: (values: InsertDiscussion) =>
      Effect.sync(() => {
        rows.set(values.id, {
          ...values,
          acceptedReplyId: null,
          pinned: false,
          locked: false,
          replyCount: 0,
        })
      }),

    list: ({ lessonSlug, limit, offset }: ListDiscussions) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter((row) => row.lessonSlug === lessonSlug)
          .sort(
            (left, right) =>
              Number(right.pinned) - Number(left.pinned) ||
              right.lastReplyAt - left.lastReplyAt ||
              right.id.localeCompare(left.id),
          )
          .slice(offset, offset + limit),
      ),

    // Mirrors every condition the real WHERE clause carries, so a service test
    // cannot pass against a fake that is more permissive than production.
    acceptReply: ({ discussionId, replyId, authorId }: AcceptReply) =>
      Effect.sync(() => {
        const row = rows.get(discussionId)
        if (!row) return false
        if (row.authorId !== authorId) return false
        if (row.kind !== 'question') return false
        if (replyParents.get(replyId) !== discussionId) return false

        rows.set(discussionId, { ...row, acceptedReplyId: replyId })
        return true
      }),

    setPinned: (id: string, pinned: boolean) =>
      Effect.sync(() => {
        const row = rows.get(id)
        if (!row) return false
        rows.set(id, { ...row, pinned })
        return true
      }),

    setLocked: (id: string, locked: boolean) =>
      Effect.sync(() => {
        const row = rows.get(id)
        if (!row) return false
        rows.set(id, { ...row, locked })
        return true
      }),

    deleteById: (id: string) => Effect.sync(() => rows.delete(id)),
  })

  return { layer, rows, replyParents }
}
