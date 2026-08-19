import '@tanstack/react-start/server-only'

import * as Effect from 'effect/Effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'

import { ForumApi } from '@/features/forum/api'
import { CurrentUser } from '@/features/forum/middleware'

import { DiscussionService } from './service'

// The handlers translate between the HTTP shape and the service, and nothing
// else. Every decision about who may do what is either on the endpoint, as
// middleware, or inside the service.
//
// DiscussionRepositoryError becomes a defect here rather than a declared error:
// a broken database is an opaque 500, not part of the API contract. The domain
// errors carry their own status and are re-failed so the client can decode them.

export const DiscussionEndpointHandlers = HttpApiBuilder.group(
  ForumApi,
  'discussions',
  Effect.fn(function* (handlers) {
    const discussions = yield* DiscussionService

    return handlers.handleAll({
      list: ({ query }) =>
        discussions
          .list({ lessonSlug: query.lessonSlug, page: query.page })
          .pipe(Effect.orDie),

      getById: ({ params }) =>
        discussions.getById(params.id).pipe(
          Effect.catchTag('DiscussionRepositoryError', Effect.die),
        ),

      // authorId comes from CurrentUser, never from the payload. Section 8:
      // external input identifies the target, it never establishes the caller.
      create: ({ payload }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser

          return yield* discussions.create({
            lessonSlug: payload.lessonSlug,
            kind: payload.kind,
            title: payload.title,
            body: payload.body,
            authorId: actor.id,
          })
        }).pipe(Effect.orDie),

      acceptReply: ({ params, payload }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser

          yield* discussions.acceptReply({
            discussionId: params.id,
            replyId: payload.replyId,
            actorId: actor.id,
          })
        }).pipe(Effect.catchTag('DiscussionRepositoryError', Effect.die)),

      setPinned: ({ params, payload }) =>
        discussions
          .setPinned(params.id, payload.pinned)
          .pipe(Effect.catchTag('DiscussionRepositoryError', Effect.die)),

      setLocked: ({ params, payload }) =>
        discussions
          .setLocked(params.id, payload.locked)
          .pipe(Effect.catchTag('DiscussionRepositoryError', Effect.die)),

      deleteById: ({ params }) =>
        discussions
          .deleteById(params.id)
          .pipe(Effect.catchTag('DiscussionRepositoryError', Effect.die)),
    })
  }),
)
