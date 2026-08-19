-- Forum: many discussions per lesson, each with replies.
--
-- Timestamps are INTEGER epoch millis rather than DATE, so domain code can take
-- them straight from Clock.currentTimeMillis and tests can move time with
-- TestClock.
--
-- "body" holds raw markdown and never HTML. Sanitizing happens on render, so a
-- gap in the sanitizer can never become stored XSS.

CREATE TABLE "discussion" (
  "id"              TEXT PRIMARY KEY NOT NULL,
  "lessonSlug"      TEXT NOT NULL,
  "kind"            TEXT NOT NULL CHECK ("kind" IN ('question','discussion')),
  "title"           TEXT NOT NULL,
  "body"            TEXT NOT NULL,
  "authorId"        TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "acceptedReplyId" TEXT,
  "pinned"          INTEGER NOT NULL DEFAULT 0,
  "locked"          INTEGER NOT NULL DEFAULT 0,
  "replyCount"      INTEGER NOT NULL DEFAULT 0 CHECK ("replyCount" >= 0),
  "createdAt"       INTEGER NOT NULL,
  "lastReplyAt"     INTEGER NOT NULL,
  CHECK ("acceptedReplyId" IS NULL OR "kind" = 'question')
);

-- Matches the list query exactly: filter by lesson, pinned first, most recent
-- activity next, id last as the tiebreaker. Without id the order is not total,
-- and two rows sharing a lastReplyAt can appear on two pages or on neither.
CREATE INDEX "discussion_lesson_activity_idx"
  ON "discussion" ("lessonSlug", "pinned" DESC, "lastReplyAt" DESC, "id" DESC);

-- The cross-lesson index page. Does not overlap the composite above by left
-- prefix, so it earns its place.
CREATE INDEX "discussion_activity_idx"
  ON "discussion" ("lastReplyAt" DESC, "id" DESC);

-- SQLite does not index the referencing side of a foreign key on its own, and
-- the cascade from user delete needs it.
CREATE INDEX "discussion_author_idx"
  ON "discussion" ("authorId");

CREATE TABLE "discussion_reply" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "discussionId" TEXT NOT NULL REFERENCES "discussion"("id") ON DELETE CASCADE,
  "body"         TEXT NOT NULL,
  "authorId"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt"    INTEGER NOT NULL
);

-- Reading one discussion's replies in order. Carries id for the same total
-- order reason as above.
CREATE INDEX "discussion_reply_thread_idx"
  ON "discussion_reply" ("discussionId", "createdAt", "id");

CREATE INDEX "discussion_reply_author_idx"
  ON "discussion_reply" ("authorId");
