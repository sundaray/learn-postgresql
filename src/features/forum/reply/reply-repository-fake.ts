import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import type {
  InsertReply,
  ListReplies,
  ParentDiscussion,
  ReplyRow,
} from './reply-repository'
import { ReplyRepository } from './reply-repository'

// Complete, compile-checked stand-in for the real adapter. Adding a method to
// the port breaks this file rather than letting the fake drift behind
// production. Ordering and batch atomicity are proved against real D1 in the
// workers tests; this exists so the rules can be exercised without a database.

export interface ReplyRepositoryFake {
  readonly layer: Layer.Layer<ReplyRepository>
  readonly rows: Map<string, ReplyRow>
  readonly parents: Map<string, ParentDiscussion>
}

export function makeReplyRepositoryFake(options?: {
  readonly parents?: ReadonlyArray<ParentDiscussion>
  readonly seed?: ReadonlyArray<ReplyRow>
}): ReplyRepositoryFake {
  const rows = new Map<string, ReplyRow>(
    (options?.seed ?? []).map((row) => [row.id, row]),
  )
  const parents = new Map<string, ParentDiscussion>(
    (options?.parents ?? []).map((parent) => [parent.id, parent]),
  )

  const layer = Layer.succeed(ReplyRepository, {
    insert: (reply: InsertReply) =>
      Effect.sync(() => {
        rows.set(reply.id, reply)
      }),

    listByDiscussion: ({ discussionId, limit, offset }: ListReplies) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter((row) => row.discussionId === discussionId)
          .sort(
            (left, right) =>
              left.createdAt - right.createdAt || left.id.localeCompare(right.id),
          )
          .slice(offset, offset + limit),
      ),

    deleteById: (id: string) => Effect.sync(() => rows.delete(id)),

    findParent: (discussionId: string) =>
      Effect.succeed(parents.get(discussionId) ?? null),
  })

  return { layer, rows, parents }
}
