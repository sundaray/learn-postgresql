import { beforeEach, expect, it } from 'vitest'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

import { user } from '@/features/auth/server/schema'
import { discussion, discussionReply } from '@/features/forum/db/schema'
import { testEnv } from '@/test-support/test-env'

// The whole denormalized replyCount design rests on one platform claim: D1 has
// no interactive transactions, so db.batch is the atomic unit. If a batch
// applied its statements independently, every counter in this feature could
// drift away from the rows it counts. This tests that claim directly rather
// than through a repository, because a repository test cannot reach the case
// where the *second* statement is the one that fails.

let seedCounter = 0
let seed = ''

beforeEach(() => {
  seedCounter += 1
  seed = `s${seedCounter}`
})

const db = () => drizzle(testEnv.DB)

it('rolls back an earlier statement when a later one in the batch fails', async () => {
  const authorId = `user_${seed}`
  const discussionId = `discussion_${seed}`
  const replyId = `reply_${seed}`

  await db()
    .insert(user)
    .values({
      id: authorId,
      name: 'Reader',
      email: `${authorId}@example.test`,
      emailVerified: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })

  await db().insert(discussion).values({
    id: discussionId,
    lessonSlug: `lesson_${seed}`,
    kind: 'question',
    title: 'Title',
    body: 'Body.',
    authorId,
    createdAt: 1_000,
    lastReplyAt: 1_000,
  })

  await db().insert(discussionReply).values({
    id: replyId,
    discussionId,
    body: 'First.',
    authorId,
    createdAt: 2_000,
  })

  // Statement one would succeed on its own. Statement two reuses a primary key
  // and cannot. The update is deliberately first, which is the ordering a
  // repository test cannot produce.
  await expect(
    db().batch([
      db()
        .update(discussion)
        .set({ replyCount: 99 })
        .where(eq(discussion.id, discussionId)),
      db().insert(discussionReply).values({
        id: replyId,
        discussionId,
        body: 'Duplicate.',
        authorId,
        createdAt: 3_000,
      }),
    ]),
  ).rejects.toThrow()

  const rows = await db()
    .select()
    .from(discussion)
    .where(eq(discussion.id, discussionId))

  // 99 surviving here would mean a batch is not atomic, and every counter in
  // this feature would need a different mechanism.
  expect(rows[0]?.replyCount).toBe(0)
})
