import { describe, expect, it } from 'vitest'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestClock from 'effect/testing/TestClock'

import { IdService } from '@/features/forum/id-service'

import type { DiscussionRow } from './discussion-repository'
import { makeDiscussionRepositoryFake } from './discussion-repository-fake'
import { DiscussionService, DiscussionServiceLive } from './service'

// Business rules over an in-memory fake. No database, so the whole file runs in
// milliseconds and a failure points at a rule rather than at SQL.

const author = 'user_author'
const stranger = 'user_stranger'

function discussionRow(overrides: Partial<DiscussionRow> = {}): DiscussionRow {
  return {
    id: 'discussion_1',
    lessonSlug: 'how-postgresql-executes-sql',
    kind: 'question',
    title: 'Why does this plan use a seq scan',
    body: 'Body.',
    authorId: author,
    acceptedReplyId: null,
    pinned: false,
    locked: false,
    replyCount: 0,
    createdAt: 1_000,
    lastReplyAt: 1_000,
    ...overrides,
  }
}

// Sequential ids, so a test can assert the exact value a create produced rather
// than only that it produced something.
function idServiceFake() {
  let counter = 0
  return Layer.succeed(IdService, {
    generate: (prefix: string) =>
      Effect.sync(() => {
        counter += 1
        return `${prefix}_${counter}`
      }),
  })
}

function harness(options?: Parameters<typeof makeDiscussionRepositoryFake>[0]) {
  const fake = makeDiscussionRepositoryFake(options)
  const layer = DiscussionServiceLive.pipe(
    Layer.provide(Layer.mergeAll(fake.layer, idServiceFake())),
  )

  const run = <A, E>(effect: Effect.Effect<A, E, DiscussionService>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)))

  return { fake, run }
}

describe('getById', () => {
  it('returns the discussion', async () => {
    const { run } = harness({ seed: [discussionRow()] })

    const found = await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* service.getById('discussion_1')
      }),
    )

    expect(found.id).toBe('discussion_1')
  })

  it('fails with DiscussionNotFoundError when there is no such row', async () => {
    const { run } = harness()

    const error = await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* Effect.flip(service.getById('missing'))
      }),
    )

    // The repository returns null and says nothing about what it means. Turning
    // that into a 404 is the service's decision.
    expect(error._tag).toBe('DiscussionNotFoundError')
  })
})

describe('create', () => {
  it('assigns the id, the author and the clock, not the caller', async () => {
    const { fake, run } = harness()

    const created = await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* service.create({
          lessonSlug: 'how-postgresql-executes-sql',
          kind: 'question',
          title: 'A title',
          body: 'A body.',
          authorId: author,
        })
      }).pipe(Effect.provide(TestClock.layer())),
    )

    expect(created.id).toBe('discussion_1')
    expect(created.authorId).toBe(author)

    const stored = fake.rows.get('discussion_1')
    // Everything a client must not be able to set starts at its own default.
    expect(stored).toMatchObject({
      acceptedReplyId: null,
      pinned: false,
      locked: false,
      replyCount: 0,
    })
    expect(stored?.createdAt).toBe(stored?.lastReplyAt)
  })
})

describe('acceptReply', () => {
  const seed = [discussionRow()]
  const replyParents = { reply_1: 'discussion_1', reply_other: 'discussion_2' }

  it('lets the author accept a reply on their own question', async () => {
    const { fake, run } = harness({ seed, replyParents })

    await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* service.acceptReply({
          discussionId: 'discussion_1',
          replyId: 'reply_1',
          actorId: author,
        })
      }),
    )

    expect(fake.rows.get('discussion_1')?.acceptedReplyId).toBe('reply_1')
  })

  it('fails with NotAuthorError rather than reporting zero rows', async () => {
    const { run } = harness({ seed, replyParents })

    const error = await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* Effect.flip(
          service.acceptReply({
            discussionId: 'discussion_1',
            replyId: 'reply_1',
            actorId: stranger,
          }),
        )
      }),
    )

    expect(error._tag).toBe('NotAuthorError')
  })

  it('fails with DiscussionLockedError on a locked question', async () => {
    const { run } = harness({
      seed: [discussionRow({ locked: true })],
      replyParents,
    })

    const error = await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* Effect.flip(
          service.acceptReply({
            discussionId: 'discussion_1',
            replyId: 'reply_1',
            actorId: author,
          }),
        )
      }),
    )

    expect(error._tag).toBe('DiscussionLockedError')
  })

  it('fails with NotAQuestionError on a plain discussion', async () => {
    const { run } = harness({
      seed: [discussionRow({ kind: 'discussion' })],
      replyParents,
    })

    const error = await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* Effect.flip(
          service.acceptReply({
            discussionId: 'discussion_1',
            replyId: 'reply_1',
            actorId: author,
          }),
        )
      }),
    )

    expect(error._tag).toBe('NotAQuestionError')
  })
})

describe('moderation', () => {
  it('fails with DiscussionNotFoundError when pinning nothing', async () => {
    const { run } = harness()

    const error = await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* Effect.flip(service.setPinned('missing', true))
      }),
    )

    expect(error._tag).toBe('DiscussionNotFoundError')
  })

  it('deletes an existing discussion', async () => {
    const { fake, run } = harness({ seed: [discussionRow()] })

    await run(
      Effect.gen(function* () {
        const service = yield* DiscussionService
        return yield* service.deleteById('discussion_1')
      }),
    )

    expect(fake.rows.has('discussion_1')).toBe(false)
  })
})
