import { beforeEach, expect, it } from 'vitest'

import * as Effect from 'effect/Effect'

import { user } from '@/features/auth/server/schema'
import { discussionReply } from '@/features/forum/db/schema'
import { DiscussionRepository } from '@/features/forum/discussion/discussion-repository'
import { DiscussionRepositoryLive } from '@/features/forum/discussion/discussion-repository-live'
import { testEnv } from '@/test-support/test-env'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

// Storage is isolated per test FILE, so each test seeds its own rows under
// unique ids rather than assuming an empty table.
let seedCounter = 0
let seed = ''

beforeEach(() => {
  seedCounter += 1
  seed = `s${seedCounter}`
})

async function seedUser(suffix = '') {
  const id = `user_${seed}${suffix}`
  await drizzle(testEnv.DB)
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

const run = <A, E>(effect: Effect.Effect<A, E, DiscussionRepository>) =>
  Effect.runPromise(effect.pipe(Effect.provide(DiscussionRepositoryLive)))

// Each list test uses its own lessonSlug, so an aggregate assertion counts
// exactly what it seeded without having to flush rows other tests left behind.
async function seedDiscussions(
  authorId: string,
  lessonSlug: string,
  rows: ReadonlyArray<{
    readonly suffix: string
    readonly lastReplyAt: number
    readonly pinned?: boolean
  }>,
) {
  await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository

      for (const row of rows) {
        yield* repository.insert({
          id: `discussion_${seed}_${row.suffix}`,
          lessonSlug,
          kind: 'discussion',
          title: `Title ${row.suffix}`,
          body: 'Body.',
          authorId,
          createdAt: 1_000,
          lastReplyAt: row.lastReplyAt,
        })
      }
    }),
  )
}

async function seedReply(discussionId: string, authorId: string) {
  const id = `reply_${seed}`
  await drizzle(testEnv.DB).insert(discussionReply).values({
    id,
    discussionId,
    body: 'A reply.',
    authorId,
    createdAt: 2_000,
  })
  return id
}

async function insertQuestion(authorId: string) {
  const id = `discussion_${seed}`
  await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      yield* repository.insert({
        id,
        lessonSlug: `lesson_${seed}`,
        kind: 'question',
        title: 'Why does this plan use a seq scan',
        body: 'Body.',
        authorId,
        createdAt: 1_000,
        lastReplyAt: 1_000,
      })
    }),
  )
  return id
}

it('inserts a discussion and reads it back by id', async () => {
  const authorId = await seedUser()
  const id = `discussion_${seed}`

  const found = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository

      yield* repository.insert({
        id,
        lessonSlug: 'how-postgresql-executes-sql',
        kind: 'question',
        title: 'Why does this plan use a seq scan',
        body: 'Raw **markdown** body.',
        authorId,
        createdAt: 1_000,
        lastReplyAt: 1_000,
      })

      return yield* repository.findById(id)
    }),
  )

  expect(found).toMatchObject({
    id,
    lessonSlug: 'how-postgresql-executes-sql',
    kind: 'question',
    authorId,
    acceptedReplyId: null,
    pinned: false,
    locked: false,
    replyCount: 0,
    createdAt: 1_000,
    lastReplyAt: 1_000,
  })
})

it('returns null for a discussion that does not exist', async () => {
  const found = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      return yield* repository.findById(`missing_${seed}`)
    }),
  )

  expect(found).toBeNull()
})

it('orders a lesson page by pinned first, then most recent activity', async () => {
  const authorId = await seedUser()
  const lessonSlug = `lesson_${seed}`

  await seedDiscussions(authorId, lessonSlug, [
    { suffix: 'old', lastReplyAt: 1_000 },
    { suffix: 'new', lastReplyAt: 3_000 },
    { suffix: 'pinned', lastReplyAt: 2_000, pinned: true },
  ])

  await testEnv.DB.prepare(
    'UPDATE "discussion" SET "pinned" = 1 WHERE "id" = ?',
  )
    .bind(`discussion_${seed}_pinned`)
    .run()

  const page = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      return yield* repository.list({ lessonSlug, limit: 10, offset: 0 })
    }),
  )

  expect(page.map((row) => row.id)).toEqual([
    `discussion_${seed}_pinned`,
    `discussion_${seed}_new`,
    `discussion_${seed}_old`,
  ])
})

it('pages a tie in lastReplyAt without dropping or repeating a row', async () => {
  const authorId = await seedUser()
  const lessonSlug = `lesson_${seed}`

  // Every row shares one lastReplyAt, so only the id tiebreaker decides the
  // order. Note this pins the specified order but cannot on its own prove the
  // ORDER BY needs the tiebreaker: discussion_lesson_activity_idx already ends
  // in id DESC, so dropping it from the query changes nothing while that index
  // exists. The test below covers the part this one cannot.
  await seedDiscussions(authorId, lessonSlug, [
    { suffix: 'a', lastReplyAt: 5_000 },
    { suffix: 'b', lastReplyAt: 5_000 },
    { suffix: 'c', lastReplyAt: 5_000 },
    { suffix: 'd', lastReplyAt: 5_000 },
  ])

  const pageOf = (offset: number) =>
    run(
      Effect.gen(function* () {
        const repository = yield* DiscussionRepository
        return yield* repository.list({ lessonSlug, limit: 2, offset })
      }),
    )

  const first = await pageOf(0)
  const second = await pageOf(2)
  const id = (suffix: string) => `discussion_${seed}_${suffix}`

  expect(first.map((row) => row.id)).toEqual([id('d'), id('c')])
  expect(second.map((row) => row.id)).toEqual([id('b'), id('a')])

  // The two pages together are still every row exactly once.
  const seenIds = [...first, ...second].map((row) => row.id)
  expect(new Set(seenIds).size).toBe(4)
})

it('reads the lesson page from the composite index with no sort step', async () => {
  // The ordering test above passes with or without the id tiebreaker, because
  // the index supplies that order either way. What actually has to hold is that
  // the planner uses discussion_lesson_activity_idx and never falls back to
  // materialising and sorting the rows. Mirrors the adapter's list query.
  const { results } = await testEnv.DB.prepare(
    'EXPLAIN QUERY PLAN SELECT * FROM "discussion" WHERE "lessonSlug" = ?' +
      ' ORDER BY "pinned" DESC, "lastReplyAt" DESC, "id" DESC LIMIT 2 OFFSET 0',
  )
    .bind('any-lesson')
    .all<{ detail: string }>()

  const plan = results.map((step) => step.detail).join(' | ')

  expect(plan).toContain('USING INDEX discussion_lesson_activity_idx')
  // A temp B-tree here would mean the index stopped satisfying the ORDER BY,
  // which is the failure the composite index exists to prevent.
  expect(plan).not.toContain('TEMP B-TREE')
})

it('accepts a reply when the caller is the author', async () => {
  const authorId = await seedUser()
  const discussionId = await insertQuestion(authorId)
  const replyId = await seedReply(discussionId, authorId)

  const { accepted, after } = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      const accepted = yield* repository.acceptReply({
        discussionId,
        replyId,
        authorId,
      })
      const after = yield* repository.findById(discussionId)
      return { accepted, after }
    }),
  )

  expect(accepted).toBe(true)
  expect(after?.acceptedReplyId).toBe(replyId)
})

it('refuses to accept a reply for someone who is not the author', async () => {
  const authorId = await seedUser('_author')
  const strangerId = await seedUser('_stranger')
  const discussionId = await insertQuestion(authorId)
  const replyId = await seedReply(discussionId, authorId)

  const { accepted, after } = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      // The author id is part of the WHERE clause, not a check the caller is
      // trusted to have made first. A stranger matches no row, so nothing is
      // written and there is no window between checking and writing.
      const accepted = yield* repository.acceptReply({
        discussionId,
        replyId,
        authorId: strangerId,
      })
      const after = yield* repository.findById(discussionId)
      return { accepted, after }
    }),
  )

  expect(accepted).toBe(false)
  expect(after?.acceptedReplyId).toBeNull()
})

it('refuses to accept a reply that belongs to a different discussion', async () => {
  const authorId = await seedUser()
  const discussionId = await insertQuestion(authorId)

  // A second question by the same author, holding the reply being aimed at the
  // first one. Same author throughout, so only the reply's parent can reject it.
  const otherId = `discussion_${seed}_other`
  await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      yield* repository.insert({
        id: otherId,
        lessonSlug: `lesson_${seed}`,
        kind: 'question',
        title: 'Another question',
        body: 'Body.',
        authorId,
        createdAt: 1_000,
        lastReplyAt: 1_000,
      })
    }),
  )
  const foreignReplyId = await seedReply(otherId, authorId)

  const { accepted, after } = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      const accepted = yield* repository.acceptReply({
        discussionId,
        replyId: foreignReplyId,
        authorId,
      })
      const after = yield* repository.findById(discussionId)
      return { accepted, after }
    }),
  )

  expect(accepted).toBe(false)
  expect(after?.acceptedReplyId).toBeNull()
})

it('refuses to accept a reply on a discussion that is not a question', async () => {
  const authorId = await seedUser()
  const discussionId = `discussion_${seed}`

  await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      yield* repository.insert({
        id: discussionId,
        lessonSlug: `lesson_${seed}`,
        kind: 'discussion',
        title: 'General chat',
        body: 'Body.',
        authorId,
        createdAt: 1_000,
        lastReplyAt: 1_000,
      })
    }),
  )
  const replyId = await seedReply(discussionId, authorId)

  // The table CHECK would reject this too, but as a database error rather than
  // a decision. Matching no row keeps it an ordinary false.
  const accepted = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      return yield* repository.acceptReply({ discussionId, replyId, authorId })
    }),
  )

  expect(accepted).toBe(false)
})

it('pins and unpins a discussion', async () => {
  const authorId = await seedUser()
  const discussionId = await insertQuestion(authorId)

  const states = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      const pinnedOk = yield* repository.setPinned(discussionId, true)
      const whilePinned = yield* repository.findById(discussionId)
      yield* repository.setPinned(discussionId, false)
      const afterUnpin = yield* repository.findById(discussionId)
      return { pinnedOk, whilePinned, afterUnpin }
    }),
  )

  expect(states.pinnedOk).toBe(true)
  expect(states.whilePinned?.pinned).toBe(true)
  expect(states.afterUnpin?.pinned).toBe(false)
})

it('locks a discussion', async () => {
  const authorId = await seedUser()
  const discussionId = await insertQuestion(authorId)

  const after = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      yield* repository.setLocked(discussionId, true)
      return yield* repository.findById(discussionId)
    }),
  )

  expect(after?.locked).toBe(true)
})

it('reports false when moderating a discussion that does not exist', async () => {
  const outcomes = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      const missing = `missing_${seed}`
      return {
        pinned: yield* repository.setPinned(missing, true),
        locked: yield* repository.setLocked(missing, true),
        deleted: yield* repository.deleteById(missing),
      }
    }),
  )

  // The service turns each false into a 404 rather than reporting success for
  // a row that was never there.
  expect(outcomes).toEqual({ pinned: false, locked: false, deleted: false })
})

it('deletes a discussion and its replies', async () => {
  const authorId = await seedUser()
  const discussionId = await insertQuestion(authorId)
  await seedReply(discussionId, authorId)

  const { deleted, after } = await run(
    Effect.gen(function* () {
      const repository = yield* DiscussionRepository
      const deleted = yield* repository.deleteById(discussionId)
      const after = yield* repository.findById(discussionId)
      return { deleted, after }
    }),
  )

  expect(deleted).toBe(true)
  expect(after).toBeNull()

  const remainingReplies = await drizzle(testEnv.DB)
    .select()
    .from(discussionReply)
    .where(eq(discussionReply.discussionId, discussionId))
  expect(remainingReplies).toEqual([])
})
