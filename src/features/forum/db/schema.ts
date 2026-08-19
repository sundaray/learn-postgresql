import '@tanstack/react-start/server-only'

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { user } from '@/features/auth/server/schema'

// Mirrors migrations/0003_forum.sql. Drizzle does not create these tables; the
// numbered SQL does, applied on deploy by the D1 resource and in tests by
// readD1Migrations. Keep the two in step.
//
// Timestamps are plain numbers rather than the auth schema's timestamp_ms Date
// mapping, because the domain reads them from Clock.currentTimeMillis, which
// returns millis. Mapping to Date and back would add a conversion on both sides
// for no gain, and the CHECK constraints and ordering all work on the integer.

export const discussion = sqliteTable(
  'discussion',
  {
    id: text('id').primaryKey(),
    lessonSlug: text('lessonSlug').notNull(),
    kind: text('kind', { enum: ['question', 'discussion'] }).notNull(),
    title: text('title').notNull(),
    // Raw markdown, never HTML.
    body: text('body').notNull(),
    authorId: text('authorId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Only ever set when kind is 'question'; the table CHECK enforces it.
    acceptedReplyId: text('acceptedReplyId'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    // Denormalized so the list page does not run a subquery per row. Every
    // reply insert and delete updates it inside the same db.batch, because D1
    // has no interactive transactions.
    replyCount: integer('replyCount').notNull().default(0),
    createdAt: integer('createdAt').notNull(),
    lastReplyAt: integer('lastReplyAt').notNull(),
  },
  (table) => [
    index('discussion_lesson_activity_idx').on(
      table.lessonSlug,
      table.pinned,
      table.lastReplyAt,
      table.id,
    ),
    index('discussion_activity_idx').on(table.lastReplyAt, table.id),
    index('discussion_author_idx').on(table.authorId),
  ],
)

export const discussionReply = sqliteTable(
  'discussion_reply',
  {
    id: text('id').primaryKey(),
    discussionId: text('discussionId')
      .notNull()
      .references(() => discussion.id, { onDelete: 'cascade' }),
    // Raw markdown, never HTML.
    body: text('body').notNull(),
    authorId: text('authorId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('createdAt').notNull(),
  },
  (table) => [
    index('discussion_reply_thread_idx').on(
      table.discussionId,
      table.createdAt,
      table.id,
    ),
    index('discussion_reply_author_idx').on(table.authorId),
  ],
)

export const forumSchema = {
  discussion,
  discussionReply,
}
