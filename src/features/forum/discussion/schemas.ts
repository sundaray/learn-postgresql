import * as Schema from 'effect/Schema'

import { Page } from '@/features/forum/schemas'

// Shared with the reply sub-domain, so it lives at the feature root. Re-exported
// here so this sub-domain has one import site for its schema constants.
export { PAGE_MAX } from '@/features/forum/schemas'

// Request and response shapes for the discussions group. Reachable from api.ts,
// so nothing here may import a driver, the D1 binding or Better Auth.

// Section 8: writes are public and rate limiting is undecided, so a bound on
// what one account can write is the only thing standing between a signed-in
// user and arbitrarily large public rows in D1. These come back as a
// field-level 400 rather than a database error because the check is here.
export const DISCUSSION_TITLE_MIN = 3
export const DISCUSSION_TITLE_MAX = 200
export const DISCUSSION_BODY_MIN = 1
export const DISCUSSION_BODY_MAX = 20_000
// The longest real lesson slug today is 48 characters, so this leaves room
// without letting an arbitrary string become a stored column and a URL segment.
export const LESSON_SLUG_MAX = 100

// Trim decodes before the length check runs, so a title of three spaces is
// refused rather than stored, and no row carries padding the reader cannot see.
const Title = Schema.Trim.check(
  Schema.isLengthBetween(DISCUSSION_TITLE_MIN, DISCUSSION_TITLE_MAX),
)

const Body = Schema.Trim.check(
  Schema.isLengthBetween(DISCUSSION_BODY_MIN, DISCUSSION_BODY_MAX),
)

export const DiscussionKind = Schema.Literals(['question', 'discussion'])

// Kebab-case, which is the shape every lesson slug in the course already has.
// This bounds the column and keeps path traversal and whitespace out of a value
// that ends up in a URL. It does not check that the lesson exists: nothing here
// may read the lesson registry, and an unknown-lesson check belongs in the
// service if it is wanted at all.
const LessonSlug = Schema.String.check(
  Schema.isMaxLength(LESSON_SLUG_MAX),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

// Written by hand, never derived from DiscussionRow. A client cannot set
// pinned, locked, replyCount, acceptedReplyId or createdAt, and authorId comes
// from CurrentUser rather than from here.
export const CreateDiscussionPayload = Schema.Struct({
  lessonSlug: LessonSlug,
  kind: DiscussionKind,
  title: Title,
  body: Body,
})

// What a reader gets back. Written by hand rather than derived from
// DiscussionRow, so widening a repository row cannot widen the public response
// by accident. Section 8 makes that the main defence in this feature: every
// field here is readable by anonymous visitors and crawlers.
//
// authorId is an opaque Better Auth id and nothing else from the user table
// travels with it. There is no author name or image yet; the join and its
// narrow projection are a step of their own.
export const DiscussionResponse = Schema.Struct({
  id: Schema.String,
  lessonSlug: Schema.String,
  kind: DiscussionKind,
  title: Schema.String,
  // Raw markdown. The renderer sanitizes; rehype-raw stays off for user content.
  body: Schema.String,
  authorId: Schema.String,
  acceptedReplyId: Schema.NullOr(Schema.String),
  pinned: Schema.Boolean,
  locked: Schema.Boolean,
  replyCount: Schema.Int,
  // Epoch millis, from Clock.currentTimeMillis. Formatting is the renderer's
  // job and has to be deterministic across the SSR boundary.
  createdAt: Schema.Int,
  lastReplyAt: Schema.Int,
})

export const ListDiscussionsQuery = Schema.Struct({
  lessonSlug: LessonSlug,
  page: Page,
})
