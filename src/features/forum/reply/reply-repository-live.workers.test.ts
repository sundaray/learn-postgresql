import { beforeEach, expect, it } from 'vitest'

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as Effect from 'effect/Effect'

import { user } from '@/features/auth/server/schema'
import { discussion } from '@/features/forum/db/schema'
import { ReplyRepository } from '@/features/forum/reply/reply-repository'
import { ReplyRepositoryLive } from '@/features/forum/reply/reply-repository-live'
import { testEnv } from '@/test-support/test-env'

let seedCounter = 0
let seed = ''

beforeEach(() => {
  seedCounter += 1
  seed = `s${seedCounter}`
})

const db = () => drizzle(testEnv.DB)

const run = <A, E>(effect: Effect.Effect<A, E, ReplyRepository>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ReplyRepositoryLive)))

async function seedDiscussion() {
  const authorId = `user_${seed}`
  const discussionId = `discussion_${seed}`

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
    title: 'Why does this plan use a seq scan',
    body: 'Body.',
    authorId,
    createdAt: 1_000,
    lastReplyAt: 1_000,
  })

  return { authorId, discussionId }
}

const readDiscussion = async (id: string) => {
  const rows = await db().select().from(discussion).where(eq(discussion.id, id))
  return rows[0]
}

it('inserts a reply and bumps the parent counters in one batch', async () => {
  const { authorId, discussionId } = await seedDiscussion()

  const rows = await run(
    Effect.gen(function* () {
      const repository = yield* ReplyRepository
      yield* repository.insert({
        id: `reply_${seed}`,
        discussionId,
        body: 'A reply.',
        authorId,
        createdAt: 5_000,
      })
      return yield* repository.listByDiscussion({
        discussionId,
        limit: 10,
        offset: 0,
      })
    }),
  )

  expect(rows.map((row) => row.id)).toEqual([`reply_${seed}`])

  const parent = await readDiscussion(discussionId)
  expect(parent?.replyCount).toBe(1)
  expect(parent?.lastReplyAt).toBe(5_000)
})

it('leaves the parent untouched when the reply insert fails', async () => {
  const { authorId, discussionId } = await seedDiscussion()
  const replyId = `reply_${seed}`

  await run(
    Effect.gen(function* () {
      const repository = yield* ReplyRepository
      yield* repository.insert({
        id: replyId,
        discussionId,
        body: 'First.',
        authorId,
        createdAt: 5_000,
      })
    }),
  )

  // Same primary key, so the insert half of the batch fails and the parent must
  // be left alone.
  //
  // Note what this does and does not prove. The insert is the first statement,
  // so it fails before the counter update is reached, and this assertion holds
  // whether or not a batch is used. It is a regression guard on the observable
  // behaviour, not evidence that the batch is doing the work. The claim that a
  // batch rolls back a statement that already succeeded is tested where it can
  // actually fail, in db/batch-atomicity.workers.test.ts.
  const failed = await Effect.runPromise(
    Effect.gen(function* () {
      const repository = yield* ReplyRepository
      return yield* repository.insert({
        id: replyId,
        discussionId,
        body: 'Duplicate.',
        authorId,
        createdAt: 9_000,
      })
    }).pipe(Effect.provide(ReplyRepositoryLive), Effect.flip),
  )

  expect(failed._tag).toBe('ReplyRepositoryError')

  const parent = await readDiscussion(discussionId)
  expect(parent?.replyCount).toBe(1)
  expect(parent?.lastReplyAt).toBe(5_000)
})

it('orders a discussion thread oldest first', async () => {
  const { authorId, discussionId } = await seedDiscussion()

  const rows = await run(
    Effect.gen(function* () {
      const repository = yield* ReplyRepository

      for (const [index, createdAt] of [7_000, 5_000, 6_000].entries()) {
        yield* repository.insert({
          id: `reply_${seed}_${index}`,
          discussionId,
          body: `Reply ${index}.`,
          authorId,
          createdAt,
        })
      }

      return yield* repository.listByDiscussion({
        discussionId,
        limit: 10,
        offset: 0,
      })
    }),
  )

  expect(rows.map((row) => row.createdAt)).toEqual([5_000, 6_000, 7_000])
})

it('decrements the parent count when a reply is deleted', async () => {
  const { authorId, discussionId } = await seedDiscussion()

  const deleted = await run(
    Effect.gen(function* () {
      const repository = yield* ReplyRepository
      yield* repository.insert({
        id: `reply_${seed}`,
        discussionId,
        body: 'A reply.',
        authorId,
        createdAt: 5_000,
      })
      return yield* repository.deleteById(`reply_${seed}`)
    }),
  )

  expect(deleted).toBe(true)

  const parent = await readDiscussion(discussionId)
  expect(parent?.replyCount).toBe(0)
})

it('reads the parent thread state a reply needs', async () => {
  const { discussionId } = await seedDiscussion()

  const open = await run(
    Effect.gen(function* () {
      const repository = yield* ReplyRepository
      return yield* repository.findParent(discussionId)
    }),
  )

  expect(open).toEqual({ id: discussionId, locked: false })

  await db()
    .update(discussion)
    .set({ locked: true })
    .where(eq(discussion.id, discussionId))

  const locked = await run(
    Effect.gen(function* () {
      const repository = yield* ReplyRepository
      return yield* repository.findParent(discussionId)
    }),
  )

  expect(locked).toEqual({ id: discussionId, locked: true })
})

it('returns null for a parent that does not exist', async () => {
  const parent = await run(
    Effect.gen(function* () {
      const repository = yield* ReplyRepository
      return yield* repository.findParent(`missing_${seed}`)
    }),
  )

  expect(parent).toBeNull()
})
