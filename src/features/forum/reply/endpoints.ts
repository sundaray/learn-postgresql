import * as Schema from 'effect/Schema'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/unstable/httpapi'

import {
  AdminMiddleware,
  AuthMiddleware,
} from '@/features/forum/middleware'
import { ValidationMiddleware } from '@/features/forum/validation'

import {
  DiscussionLockedError,
  DiscussionNotFoundError,
  ReplyNotFoundError,
} from './errors'
import {
  CreateReplyPayload,
  ListRepliesQuery,
  ReplyResponse,
} from './schemas'

// No group prefix. A reply is read and written under its discussion, but
// deleting one addresses the reply itself, and forcing both under one prefix
// would mean a delete path that names a discussion it does not need.

const list = HttpApiEndpoint.get('list', '/discussions/:discussionId/replies', {
  params: Schema.Struct({ discussionId: Schema.String }),
  query: ListRepliesQuery,
  success: Schema.Array(ReplyResponse),
})

// A missing or locked parent is reported with the shared discussion errors, so
// a client sees one vocabulary whichever endpoint refused it.
const create = HttpApiEndpoint.post(
  'create',
  '/discussions/:discussionId/replies',
  {
    params: Schema.Struct({ discussionId: Schema.String }),
    payload: CreateReplyPayload,
    success: ReplyResponse.pipe(HttpApiSchema.status(201)),
    error: [DiscussionNotFoundError, DiscussionLockedError],
  },
).middleware(AuthMiddleware)

// Admin only, matching decision 5: users cannot delete their own posts yet.
const deleteById = HttpApiEndpoint.delete('deleteById', '/replies/:id', {
  params: Schema.Struct({ id: Schema.String }),
  success: HttpApiSchema.NoContent,
  error: ReplyNotFoundError,
}).middleware(AdminMiddleware)

export class RepliesGroup extends HttpApiGroup.make('replies')
  .add(list)
  .add(create)
  .add(deleteById)
  .middleware(ValidationMiddleware) {}
