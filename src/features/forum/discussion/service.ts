import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'

import { IdService } from '@/features/forum/id-service'

import type {
  DiscussionKind,
  DiscussionRow,
} from './discussion-repository'
import { DiscussionRepository } from './discussion-repository'
import type { DiscussionRepositoryError } from './errors'
import {
  DiscussionLockedError,
  DiscussionNotFoundError,
  NotAQuestionError,
  NotAuthorError,
} from './errors'
import { canAcceptReply, pageOffset } from './rules'

// Business rules over the port. No SQL, and no knowledge of which adapter is
// underneath, which is what lets these tests run in Node against a fake.

export const DISCUSSIONS_PAGE_SIZE = 20

export interface CreateDiscussion {
  readonly lessonSlug: string
  readonly kind: DiscussionKind
  readonly title: string
  readonly body: string
  // Comes from CurrentUser at the endpoint, never from the request payload.
  readonly authorId: string
}

export interface AcceptReplyCommand {
  readonly discussionId: string
  readonly replyId: string
  readonly actorId: string
}

export class DiscussionService extends Context.Service<
  DiscussionService,
  {
    readonly list: (options: {
      readonly lessonSlug: string
      readonly page: number
    }) => Effect.Effect<
      ReadonlyArray<DiscussionRow>,
      DiscussionRepositoryError
    >
    readonly getById: (
      id: string,
    ) => Effect.Effect<
      DiscussionRow,
      DiscussionNotFoundError | DiscussionRepositoryError
    >
    readonly create: (
      input: CreateDiscussion,
    ) => Effect.Effect<DiscussionRow, DiscussionRepositoryError>
    readonly acceptReply: (
      command: AcceptReplyCommand,
    ) => Effect.Effect<
      void,
      | DiscussionNotFoundError
      | NotAuthorError
      | NotAQuestionError
      | DiscussionLockedError
      | DiscussionRepositoryError
    >
    readonly setPinned: (
      id: string,
      pinned: boolean,
    ) => Effect.Effect<
      void,
      DiscussionNotFoundError | DiscussionRepositoryError
    >
    readonly setLocked: (
      id: string,
      locked: boolean,
    ) => Effect.Effect<
      void,
      DiscussionNotFoundError | DiscussionRepositoryError
    >
    readonly deleteById: (
      id: string,
    ) => Effect.Effect<
      void,
      DiscussionNotFoundError | DiscussionRepositoryError
    >
  }
>()('DiscussionService') {}

export const DiscussionServiceLive = Layer.effect(DiscussionService)(
  Effect.gen(function* () {
    const repository = yield* DiscussionRepository
    const ids = yield* IdService

    // A write that matched no row means the discussion is not there. Every
    // moderation operation says so the same way.
    const requireFound = (id: string) => (updated: boolean) =>
      updated
        ? Effect.void
        : Effect.fail(new DiscussionNotFoundError({ id }))

    return {
      list: ({ lessonSlug, page }) =>
        repository.list({
          lessonSlug,
          limit: DISCUSSIONS_PAGE_SIZE,
          offset: pageOffset({ page, pageSize: DISCUSSIONS_PAGE_SIZE }),
        }),

      getById: (id: string) =>
        repository.findById(id).pipe(
          Effect.flatMap((row) =>
            row
              ? Effect.succeed(row)
              : Effect.fail(new DiscussionNotFoundError({ id })),
          ),
        ),

      create: (input: CreateDiscussion) =>
        Effect.gen(function* () {
          // Both from services, so a test can predict them. The clock is read
          // once and used for both timestamps, so a new discussion sorts by the
          // moment it was written rather than a moment later.
          const id = yield* ids.generate('discussion')
          const now = yield* Clock.currentTimeMillis

          const values = {
            id,
            lessonSlug: input.lessonSlug,
            kind: input.kind,
            title: input.title,
            body: input.body,
            authorId: input.authorId,
            createdAt: now,
            lastReplyAt: now,
          }

          yield* repository.insert(values)

          // The row as it now exists, with the columns a client cannot set at
          // their defaults rather than echoed back from the request.
          return {
            ...values,
            acceptedReplyId: null,
            pinned: false,
            locked: false,
            replyCount: 0,
          } satisfies DiscussionRow
        }),

      acceptReply: ({ discussionId, replyId, actorId }: AcceptReplyCommand) =>
        Effect.gen(function* () {
          const row = yield* repository.findById(discussionId)
          if (!row) {
            return yield* Effect.fail(
              new DiscussionNotFoundError({ id: discussionId }),
            )
          }

          // The rule carries the reason, so the caller gets a precise error
          // instead of the write's bare false. The repository still repeats
          // every one of these in its WHERE clause, which is what closes the
          // window between deciding here and writing there.
          const decision = canAcceptReply({ discussion: row, actorId })
          if (Result.isFailure(decision)) {
            switch (decision.failure) {
              case 'not-author':
                return yield* Effect.fail(
                  new NotAuthorError({ id: discussionId }),
                )
              case 'not-a-question':
                return yield* Effect.fail(
                  new NotAQuestionError({ id: discussionId }),
                )
              case 'locked':
                return yield* Effect.fail(
                  new DiscussionLockedError({ id: discussionId }),
                )
            }
          }

          const accepted = yield* repository.acceptReply({
            discussionId,
            replyId,
            authorId: actorId,
          })

          // The rules passed but the write still matched nothing, which means
          // the reply does not belong to this discussion or the row changed
          // underneath. Not found is the honest answer.
          if (!accepted) {
            return yield* Effect.fail(
              new DiscussionNotFoundError({ id: replyId }),
            )
          }
        }),

      setPinned: (id: string, pinned: boolean) =>
        repository.setPinned(id, pinned).pipe(Effect.flatMap(requireFound(id))),

      setLocked: (id: string, locked: boolean) =>
        repository.setLocked(id, locked).pipe(Effect.flatMap(requireFound(id))),

      deleteById: (id: string) =>
        repository.deleteById(id).pipe(Effect.flatMap(requireFound(id))),
    }
  }),
)
