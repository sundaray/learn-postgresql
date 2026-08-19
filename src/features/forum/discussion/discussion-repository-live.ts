import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { and, desc, eq, exists, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { discussion, discussionReply } from '@/features/forum/db/schema'

import type {
  AcceptReply,
  DiscussionRow,
  InsertDiscussion,
  ListDiscussions,
} from './discussion-repository'
import { DiscussionRepository } from './discussion-repository'
import { DiscussionRepositoryError } from './errors'

// The adapter. The only file in this sub-domain that touches SQL, and the only
// one that imports drizzle or the D1 binding.

// Drizzle wraps driver failures in a DrizzleQueryError whose own message is
// just "Failed query: ...". The text that says what actually went wrong, such
// as a CHECK or UNIQUE constraint, lives further down the cause chain, so the
// chain is flattened here rather than discarded.
function describeCause(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error

  while (current instanceof Error) {
    parts.push(current.message)
    current = current.cause
  }

  return parts.length > 0 ? parts.join(': ') : String(error)
}

const query = <A>(method: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (error) =>
      new DiscussionRepositoryError({ cause: describeCause(error) }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError('Database query failed', error).pipe(
        Effect.annotateLogs({ method: `DiscussionRepository.${method}` }),
      ),
    ),
  )

export const DiscussionRepositoryLive = Layer.effect(DiscussionRepository)(
  Effect.sync(() => {
    const db = drizzle(env.DB)

    return {
      findById: (id: string) =>
        query('findById', async () => {
          const rows = await db
            .select()
            .from(discussion)
            .where(eq(discussion.id, id))
            .limit(1)

          return (rows[0] ?? null) satisfies DiscussionRow | null
        }),

      insert: (values: InsertDiscussion) =>
        query('insert', () =>
          db.insert(discussion).values(values).run(),
        ).pipe(Effect.asVoid),

      list: ({ lessonSlug, limit, offset }: ListDiscussions) =>
        query('list', async () => {
          // Column order here matches discussion_lesson_activity_idx exactly,
          // so this reads the index rather than sorting a result set.
          const rows = await db
            .select()
            .from(discussion)
            .where(eq(discussion.lessonSlug, lessonSlug))
            .orderBy(
              desc(discussion.pinned),
              desc(discussion.lastReplyAt),
              desc(discussion.id),
            )
            .limit(limit)
            .offset(offset)

          return rows satisfies ReadonlyArray<DiscussionRow>
        }),

      acceptReply: ({ discussionId, replyId, authorId }: AcceptReply) =>
        query('acceptReply', async () => {
          const updated = await db
            .update(discussion)
            .set({ acceptedReplyId: replyId })
            .where(
              and(
                eq(discussion.id, discussionId),
                // Ownership, so a stranger matches no row.
                eq(discussion.authorId, authorId),
                // Only a question can be solved. The table CHECK says the same
                // thing, but as an error rather than a decision.
                eq(discussion.kind, 'question'),
                // The reply has to belong to this discussion, otherwise an
                // answer could be borrowed from another thread.
                exists(
                  db
                    .select({ one: sql`1` })
                    .from(discussionReply)
                    .where(
                      and(
                        eq(discussionReply.id, replyId),
                        eq(discussionReply.discussionId, discussionId),
                      ),
                    ),
                ),
              ),
            )
            .returning({ id: discussion.id })

          return updated.length > 0
        }),

      setPinned: (id: string, pinned: boolean) =>
        query('setPinned', async () => {
          const updated = await db
            .update(discussion)
            .set({ pinned })
            .where(eq(discussion.id, id))
            .returning({ id: discussion.id })

          return updated.length > 0
        }),

      setLocked: (id: string, locked: boolean) =>
        query('setLocked', async () => {
          const updated = await db
            .update(discussion)
            .set({ locked })
            .where(eq(discussion.id, id))
            .returning({ id: discussion.id })

          return updated.length > 0
        }),

      // Replies go with it through the foreign key cascade, which is proved in
      // db/schema.workers.test.ts rather than assumed.
      deleteById: (id: string) =>
        query('deleteById', async () => {
          const deleted = await db
            .delete(discussion)
            .where(eq(discussion.id, id))
            .returning({ id: discussion.id })

          return deleted.length > 0
        }),
    }
  }),
)
