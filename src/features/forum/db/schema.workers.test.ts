import { beforeEach, expect, it } from 'vitest'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

import { user } from '@/features/auth/server/schema'
import { discussion, discussionReply } from '@/features/forum/db/schema'
import { testEnv } from '@/test-support/test-env'

// Storage is isolated per test FILE, not per test, so every test seeds its own
// rows under unique ids rather than assuming an empty table.
let seedCounter = 0
let seed = ''

beforeEach(() => {
  seedCounter += 1
  seed = `s${seedCounter}`
})

const db = () => drizzle(testEnv.DB)

async function seedUser() {
  const id = `user_${seed}`
  await db()
    .insert(user)
    .values({
      id,
      name: 'Reader',
      email: `${id}@example.test`,
      emailVerified: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
  return id
}

async function seedDiscussion(authorId: string, kind: 'question' | 'discussion') {
  const id = `discussion_${seed}`
  await db().insert(discussion).values({
    id,
    lessonSlug: 'how-postgresql-executes-sql',
    kind,
    title: 'Why does this plan use a seq scan',
    body: 'Raw **markdown** body.',
    authorId,
    createdAt: 1_000,
    lastReplyAt: 1_000,
  })
  return id
}

it('stores a discussion and reads it back', async () => {
  const authorId = await seedUser()
  const discussionId = await seedDiscussion(authorId, 'question')

  const rows = await db()
    .select()
    .from(discussion)
    .where(eq(discussion.id, discussionId))

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    kind: 'question',
    pinned: false,
    locked: false,
    replyCount: 0,
  })
})

it('rejects a kind outside the closed set', async () => {
  const authorId = await seedUser()

  await expect(
    testEnv.DB.prepare(
      'INSERT INTO "discussion" ("id","lessonSlug","kind","title","body","authorId","createdAt","lastReplyAt")' +
        " VALUES (?,?,'announcement',?,?,?,?,?)",
    )
      .bind(`d_${seed}`, 'lesson', 'Title', 'Body', authorId, 1000, 1000)
      .run(),
  ).rejects.toThrow(/CHECK constraint failed/)
})

it('rejects a negative replyCount', async () => {
  const authorId = await seedUser()
  const discussionId = await seedDiscussion(authorId, 'question')

  await expect(
    testEnv.DB.prepare(
      'UPDATE "discussion" SET "replyCount" = -1 WHERE "id" = ?',
    )
      .bind(discussionId)
      .run(),
  ).rejects.toThrow(/CHECK constraint failed/)
})

it('rejects an accepted reply on a discussion that is not a question', async () => {
  const authorId = await seedUser()
  const discussionId = await seedDiscussion(authorId, 'discussion')

  await expect(
    testEnv.DB.prepare(
      'UPDATE "discussion" SET "acceptedReplyId" = ? WHERE "id" = ?',
    )
      .bind(`reply_${seed}`, discussionId)
      .run(),
  ).rejects.toThrow(/CHECK constraint failed/)
})

// Section 7 flags this as the thing to verify rather than assume: SQLite only
// enforces foreign keys when the connection has them enabled, so the cascade
// might silently not fire. If either of the next two fails, deletion has to
// clean up by hand inside the same db.batch instead.
it('cascades a discussion delete to its replies', async () => {
  const authorId = await seedUser()
  const discussionId = await seedDiscussion(authorId, 'question')

  await db().insert(discussionReply).values({
    id: `reply_${seed}`,
    discussionId,
    body: 'A reply.',
    authorId,
    createdAt: 2_000,
  })

  // Assert the reply is really there first, so an insert that quietly failed
  // cannot make the post-delete assertion pass for the wrong reason.
  const before = await db()
    .select()
    .from(discussionReply)
    .where(eq(discussionReply.discussionId, discussionId))
  expect(before).toHaveLength(1)

  await db().delete(discussion).where(eq(discussion.id, discussionId))

  const replies = await db()
    .select()
    .from(discussionReply)
    .where(eq(discussionReply.discussionId, discussionId))

  expect(replies).toEqual([])
})

it('cascades a user delete to their discussions', async () => {
  const authorId = await seedUser()
  const discussionId = await seedDiscussion(authorId, 'question')

  const before = await db()
    .select()
    .from(discussion)
    .where(eq(discussion.id, discussionId))
  expect(before).toHaveLength(1)

  await db().delete(user).where(eq(user.id, authorId))

  const rows = await db()
    .select()
    .from(discussion)
    .where(eq(discussion.id, discussionId))

  expect(rows).toEqual([])
})
