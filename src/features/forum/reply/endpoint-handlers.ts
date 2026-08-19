import '@tanstack/react-start/server-only'

import * as Effect from 'effect/Effect'
import { HttpApiBuilder } from 'effect/unstable/httpapi'

import { ForumApi } from '@/features/forum/api'
import { CurrentUser } from '@/features/forum/middleware'

import { ReplyService } from './service'

export const ReplyEndpointHandlers = HttpApiBuilder.group(
  ForumApi,
  'replies',
  Effect.fn(function* (handlers) {
    const replies = yield* ReplyService

    return handlers.handleAll({
      list: ({ params, query }) =>
        replies
          .list({ discussionId: params.discussionId, page: query.page })
          .pipe(Effect.orDie),

      create: ({ params, payload }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser

          return yield* replies.create({
            discussionId: params.discussionId,
            body: payload.body,
            authorId: actor.id,
          })
        }).pipe(Effect.catchTag('ReplyRepositoryError', Effect.die)),

      deleteById: ({ params }) =>
        replies
          .deleteById(params.id)
          .pipe(Effect.catchTag('ReplyRepositoryError', Effect.die)),
    })
  }),
)
