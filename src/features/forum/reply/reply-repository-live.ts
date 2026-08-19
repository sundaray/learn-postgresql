import '@tanstack/react-start/server-only'

import { env } from 'cloudflare:workers'
import { and, asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { discussion, discussionReply } from '@/features/forum/db/schema'

import type {
  InsertReply,
  ListReplies,
  ParentDiscussion,
  ReplyRow,
} from './reply-repository'
import { ReplyRepository } from './reply-repository'
import { ReplyRepositoryError } from './errors'

// Drizzle reports a driver failure as a DrizzleQueryError whose own message is
// only "Failed query: ...". The text naming the actual constraint sits further
// down the cause chain, so the chain is flattened rather than discarded.
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
    catch: (error) => new ReplyRepositoryError({ cause: describeCause(error) }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError('Database query failed', error).pipe(
        Effect.annotateLogs({ method: `ReplyRepository.${method}` }),
      ),
    ),
  )

export const ReplyRepositoryLive = Layer.effect(ReplyRepository)(
  Effect.sync(() => {
    const db = drizzle(env.DB)

    return {
      insert: (reply: InsertReply) =>
        query('insert', () =>
          // D1 has no interactive transactions, so a batch is the only way to
          // make these land together. Split into two statements, a failed
          // insert would still leave replyCount incremented.
          db.batch([
            db.insert(discussionReply).values(reply),
            db
              .update(discussion)
              .set({
                replyCount: sql`${discussion.replyCount} + 1`,
                lastReplyAt: reply.createdAt,
              })
              .where(eq(discussion.id, reply.discussionId)),
          ]),
        ).pipe(Effect.asVoid),

      listByDiscussion: ({ discussionId, limit, offset }: ListReplies) =>
        query('listByDiscussion', async () => {
          const rows = await db
            .select()
            .from(discussionReply)
            .where(eq(discussionReply.discussionId, discussionId))
            .orderBy(asc(discussionReply.createdAt), asc(discussionReply.id))
            .limit(limit)
            .offset(offset)

          return rows satisfies ReadonlyArray<ReplyRow>
        }),

      // Projects only what the reply side needs. Selecting the whole row here
      // would pull the parent's author, body and moderation columns into a
      // sub-domain that has no business reading them.
      findParent: (discussionId: string) =>
        query('findParent', async () => {
          const rows = await db
            .select({ id: discussion.id, locked: discussion.locked })
            .from(discussion)
            .where(eq(discussion.id, discussionId))
            .limit(1)

          return (rows[0] ?? null) satisfies ParentDiscussion | null
        }),

      deleteById: (id: string) =>
        query('deleteById', async () => {
          const rows = await db
            .select({ discussionId: discussionReply.discussionId })
            .from(discussionReply)
            .where(eq(discussionReply.id, id))
            .limit(1)

          const parent = rows[0]
          if (!parent) return false

          // The guard on replyCount keeps the decrement from driving the column
          // below zero if the count and the rows ever disagree. The CHECK would
          // reject it anyway, but as a failed write rather than a no-op.
          await db.batch([
            db.delete(discussionReply).where(eq(discussionReply.id, id)),
            db
              .update(discussion)
              .set({ replyCount: sql`${discussion.replyCount} - 1` })
              .where(
                and(
                  eq(discussion.id, parent.discussionId),
                  sql`${discussion.replyCount} > 0`,
                ),
              ),
          ])

          return true
        }),
    }
  }),
)
