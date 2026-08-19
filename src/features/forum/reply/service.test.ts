import { describe, expect, it } from 'vitest'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestClock from 'effect/testing/TestClock'

import { IdService } from '@/features/forum/id-service'

import { makeReplyRepositoryFake } from './reply-repository-fake'
import { ReplyService, ReplyServiceLive } from './service'

const author = 'user_author'
const openThread = { id: 'discussion_open', locked: false }
const lockedThread = { id: 'discussion_locked', locked: true }

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

function harness(options?: Parameters<typeof makeReplyRepositoryFake>[0]) {
  const fake = makeReplyRepositoryFake(options)
  const layer = ReplyServiceLive.pipe(
    Layer.provide(Layer.mergeAll(fake.layer, idServiceFake())),
  )

  const run = <A, E>(effect: Effect.Effect<A, E, ReplyService>) =>
    Effect.runPromise(
      effect.pipe(Effect.provide(layer), Effect.provide(TestClock.layer())),
    )

  return { fake, run }
}

describe('create', () => {
  it('writes a reply to an open thread', async () => {
    const { fake, run } = harness({ parents: [openThread] })

    const created = await run(
      Effect.gen(function* () {
        const service = yield* ReplyService
        return yield* service.create({
          discussionId: openThread.id,
          body: 'An answer.',
          authorId: author,
        })
      }),
    )

    expect(created.id).toBe('reply_1')
    expect(created.authorId).toBe(author)
    expect(fake.rows.get('reply_1')?.discussionId).toBe(openThread.id)
  })

  it('fails with DiscussionLockedError on a locked thread', async () => {
    const { fake, run } = harness({ parents: [lockedThread] })

    const error = await run(
      Effect.gen(function* () {
        const service = yield* ReplyService
        return yield* Effect.flip(
          service.create({
            discussionId: lockedThread.id,
            body: 'An answer.',
            authorId: author,
          }),
        )
      }),
    )

    expect(error._tag).toBe('DiscussionLockedError')
    // Refusing has to mean nothing was written, not that the error came after.
    expect(fake.rows.size).toBe(0)
  })

  it('fails with DiscussionNotFoundError when the thread is missing', async () => {
    const { run } = harness()

    const error = await run(
      Effect.gen(function* () {
        const service = yield* ReplyService
        return yield* Effect.flip(
          service.create({
            discussionId: 'missing',
            body: 'An answer.',
            authorId: author,
          }),
        )
      }),
    )

    expect(error._tag).toBe('DiscussionNotFoundError')
  })
})

describe('deleteById', () => {
  it('fails with ReplyNotFoundError when there is no such reply', async () => {
    const { run } = harness()

    const error = await run(
      Effect.gen(function* () {
        const service = yield* ReplyService
        return yield* Effect.flip(service.deleteById('missing'))
      }),
    )

    expect(error._tag).toBe('ReplyNotFoundError')
  })
})
