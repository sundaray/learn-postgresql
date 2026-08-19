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
  NotAQuestionError,
  NotAuthorError,
} from './errors'
import {
  CreateDiscussionPayload,
  DiscussionResponse,
  ListDiscussionsQuery,
} from './schemas'

// Section 5: moderation is not its own sub-domain. Pin, lock and delete are
// more endpoints on this resource, differing only in who may call them, so the
// public, authenticated and admin endpoints sit in one group and the middleware
// goes on the endpoint rather than the group.
//
// The two auth middlewares both provide CurrentUser, so the compiler cannot
// tell them apart. That is why section 8 requires a test per admin endpoint
// proving an ordinary signed-in user gets a 403.

const list = HttpApiEndpoint.get('list', '/', {
  query: ListDiscussionsQuery,
  success: Schema.Array(DiscussionResponse),
})

const getById = HttpApiEndpoint.get('getById', '/:id', {
  params: Schema.Struct({ id: Schema.String }),
  success: DiscussionResponse,
  error: DiscussionNotFoundError,
})

const create = HttpApiEndpoint.post('create', '/', {
  payload: CreateDiscussionPayload,
  success: DiscussionResponse.pipe(HttpApiSchema.status(201)),
}).middleware(AuthMiddleware)

// The author of a question marks one reply as the answer. Not admin: this is
// the asker's call, which is why the rule and the WHERE clause both check
// authorship rather than a role.
const acceptReply = HttpApiEndpoint.post('acceptReply', '/:id/accept', {
  params: Schema.Struct({ id: Schema.String }),
  payload: Schema.Struct({ replyId: Schema.String }),
  success: HttpApiSchema.NoContent,
  error: [
    DiscussionNotFoundError,
    NotAuthorError,
    NotAQuestionError,
    DiscussionLockedError,
  ],
}).middleware(AuthMiddleware)

// One endpoint per flag rather than one per direction, so unpinning is the same
// endpoint with `false` and there is no /unpin to forget to protect.
const setPinned = HttpApiEndpoint.post('setPinned', '/:id/pin', {
  params: Schema.Struct({ id: Schema.String }),
  payload: Schema.Struct({ pinned: Schema.Boolean }),
  success: HttpApiSchema.NoContent,
  error: DiscussionNotFoundError,
}).middleware(AdminMiddleware)

const setLocked = HttpApiEndpoint.post('setLocked', '/:id/lock', {
  params: Schema.Struct({ id: Schema.String }),
  payload: Schema.Struct({ locked: Schema.Boolean }),
  success: HttpApiSchema.NoContent,
  error: DiscussionNotFoundError,
}).middleware(AdminMiddleware)

// Hard delete. Replies go with it through the foreign key cascade, which
// db/schema.workers.test.ts proves rather than assumes. A soft delete would
// have to be filtered out of the list query as well.
const deleteById = HttpApiEndpoint.delete('deleteById', '/:id', {
  params: Schema.Struct({ id: Schema.String }),
  success: HttpApiSchema.NoContent,
  error: DiscussionNotFoundError,
}).middleware(AdminMiddleware)

export class DiscussionsGroup extends HttpApiGroup.make('discussions')
  .add(list)
  .add(getById)
  .add(create)
  .add(acceptReply)
  .add(setPinned)
  .add(setLocked)
  .add(deleteById)
  // Every endpoint here decodes something a client sent, so all of them get
  // field-level 400s rather than the framework's blank one.
  .middleware(ValidationMiddleware)
  .prefix('/discussions') {}
