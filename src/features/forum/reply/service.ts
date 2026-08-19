import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'

import {
  DiscussionLockedError,
  DiscussionNotFoundError,
} from '@/features/forum/errors'
import { IdService } from '@/features/forum/id-service'

import type { ReplyRepositoryError } from './errors'
import { ReplyNotFoundError } from './errors'
import type { ReplyRow } from './reply-repository'
import { ReplyRepository } from './reply-repository'
import { canReply } from './rules'

export const REPLIES_PAGE_SIZE = 50

export interface CreateReply {
  readonly discussionId: string
  readonly body: string
  // From CurrentUser at the endpoint, never from the request payload.
  readonly authorId: string
}

export class ReplyService extends Context.Service<
  ReplyService,
  {
    readonly list: (options: {
      readonly discussionId: string
      readonly page: number
    }) => Effect.Effect<ReadonlyArray<ReplyRow>, ReplyRepositoryError>
    readonly create: (
      input: CreateReply,
    ) => Effect.Effect<
      ReplyRow,
      | DiscussionNotFoundError
      | DiscussionLockedError
      | ReplyRepositoryError
    >
    readonly deleteById: (
      id: string,
    ) => Effect.Effect<void, ReplyNotFoundError | ReplyRepositoryError>
  }
>()('ReplyService') {}

export const ReplyServiceLive = Layer.effect(ReplyService)(
  Effect.gen(function* () {
    const repository = yield* ReplyRepository
    const ids = yield* IdService

    return {
      list: ({ discussionId, page }) =>
        repository.listByDiscussion({
          discussionId,
          limit: REPLIES_PAGE_SIZE,
          // Replies read oldest first, so the offset is the plain page stride.
          offset: Math.max(0, page - 1) * REPLIES_PAGE_SIZE,
        }),

      create: (input: CreateReply) =>
        Effect.gen(function* () {
          const parent = yield* repository.findParent(input.discussionId)
          if (!parent) {
            return yield* Effect.fail(
              new DiscussionNotFoundError({ id: input.discussionId }),
            )
          }

          const decision = canReply(parent)
          if (Result.isFailure(decision)) {
            return yield* Effect.fail(
              new DiscussionLockedError({ id: input.discussionId }),
            )
          }

          const id = yield* ids.generate('reply')
          const now = yield* Clock.currentTimeMillis

          const values = {
            id,
            discussionId: input.discussionId,
            body: input.body,
            authorId: input.authorId,
            createdAt: now,
          }

          // The adapter writes this and the parent's counters in one batch, so
          // there is no state where the reply exists and the count disagrees.
          yield* repository.insert(values)

          return values satisfies ReplyRow
        }),

      deleteById: (id: string) =>
        repository
          .deleteById(id)
          .pipe(
            Effect.flatMap((deleted) =>
              deleted
                ? Effect.void
                : Effect.fail(new ReplyNotFoundError({ id })),
            ),
          ),
    }
  }),
)
