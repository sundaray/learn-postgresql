import * as Schema from 'effect/Schema'

import { Page } from '@/features/forum/schemas'

// Shared with the discussion sub-domain, so it lives at the feature root.
export { PAGE_MAX } from '@/features/forum/schemas'

// Request and response shapes for the replies group. Reachable from api.ts, so
// nothing here may import a driver, the D1 binding or Better Auth.

// Half the discussion body allowance. Same reason as section 8 gives for the
// discussion bounds: writes are public, rate limiting is undecided, and a reply
// is the cheapest row to create in bulk.
export const REPLY_BODY_MIN = 1
export const REPLY_BODY_MAX = 10_000

// Trim runs before the length check, so a reply of three spaces is refused
// rather than stored as an empty-looking post.
const Body = Schema.Trim.check(
  Schema.isLengthBetween(REPLY_BODY_MIN, REPLY_BODY_MAX),
)

// The parent discussion comes from the path and the author from CurrentUser,
// so the body is the only thing a client supplies.
export const CreateReplyPayload = Schema.Struct({
  body: Body,
})

// What a reader gets back. Written by hand rather than derived from ReplyRow,
// so widening a repository row cannot widen the public response by accident.
export const ReplyResponse = Schema.Struct({
  id: Schema.String,
  discussionId: Schema.String,
  // Raw markdown. The renderer sanitizes it.
  body: Schema.String,
  authorId: Schema.String,
  createdAt: Schema.Int,
})

// The discussion comes from the path, so the page is the only query parameter.
export const ListRepliesQuery = Schema.Struct({
  page: Page,
})
