import { beforeEach, expect, it } from 'vitest'

import { drizzle } from 'drizzle-orm/d1'

import { user } from '@/features/auth/server/schema'
import { discussion } from '@/features/forum/db/schema'
import { forumWebHandler } from '@/features/forum/web-handler'
import { testEnv } from '@/test-support/test-env'

// Drives the assembled API the way the api/forum/$.ts route will: a raw Request
// in, a Response out. Everything below it is real, including D1.
//
// Storage is isolated per test FILE, so each test seeds under a unique id and
// its own lessonSlug rather than assuming an empty table.
let seedCounter = 0
let seed = ''

beforeEach(() => {
  seedCounter += 1
  seed = `s${seedCounter}`
})

// The allowed host pattern is `localhost:*`, so the port is part of matching. Better Auth builds its base
// URL from the request Host and refuses a host outside that list, so a write
// sent to any other host fails the session lookup before it can report that
// there is no session.
// Two things a real inbound request has that `new Request()` does not give you
// for free. localhost is in the auth instance's allowedHosts, and Better Auth
// builds its base URL from the Host header, refusing any host outside the list;
// without the header at all it cannot resolve one and the session lookup fails
// before it can report that there is no session.
const call = (path: string, init?: RequestInit) =>
  forumWebHandler(
    new Request(`http://localhost:8787${path}`, {
      ...init,
      headers: { host: 'localhost:8787', ...init?.headers },
    }),
  )

// response.json() is unknown, and every assertion below reaches into the body.
// One contained cast per read beats a cast at each property.
async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function seedUser() {
  const id = `user_${seed}`
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

async function seedDiscussion(authorId: string, lessonSlug: string) {
  const id = `discussion_${seed}`
  await drizzle(testEnv.DB)
    .insert(discussion)
    .values({
      id,
      lessonSlug,
      kind: 'question',
      title: 'Why a sequential scan?',
      body: 'EXPLAIN shows Seq Scan.',
      authorId,
      createdAt: 1_000,
      lastReplyAt: 1_000,
    })
  return id
}

it('serves a lesson list to a reader with no session', async () => {
  const authorId = await seedUser()
  const lessonSlug = `lesson-${seed}`
  const id = await seedDiscussion(authorId, lessonSlug)

  const response = await call(`/api/forum/discussions?lessonSlug=${lessonSlug}`)

  expect(response.status).toBe(200)
  expect(await readJson(response)).toStrictEqual([
    {
      id,
      lessonSlug,
      kind: 'question',
      title: 'Why a sequential scan?',
      body: 'EXPLAIN shows Seq Scan.',
      authorId,
      acceptedReplyId: null,
      pinned: false,
      locked: false,
      replyCount: 0,
      createdAt: 1_000,
      lastReplyAt: 1_000,
    },
  ])
})

it('serves one discussion by id, and 404s for an id that is not there', async () => {
  const authorId = await seedUser()
  const lessonSlug = `lesson-${seed}`
  const id = await seedDiscussion(authorId, lessonSlug)

  const found = await call(`/api/forum/discussions/${id}`)
  expect(found.status).toBe(200)
  expect((await readJson<{ id: string }>(found)).id).toBe(id)

  const missing = await call(`/api/forum/discussions/discussion_${seed}_nope`)
  expect(missing.status).toBe(404)
  expect((await readJson<{ _tag: string }>(missing))._tag).toBe(
    'DiscussionNotFoundError',
  )
})

// Reads are public; writes are not. Nothing about this depends on a session
// existing, which is what makes it a step 9 test rather than a step 10 one.
//
// What it deliberately does not cover: swapping AuthMiddleware for
// AdminMiddleware on this endpoint keeps the test green, because both refuse a
// missing session the same way. Only a signed-in ordinary user getting a 403
// separates them, which needs a real session. Section 8 requires exactly that,
// one per admin endpoint, in step 10.
it('refuses a write from a reader with no session', async () => {
  const response = await call('/api/forum/discussions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lessonSlug: `lesson-${seed}`,
      kind: 'question',
      title: 'A title long enough to pass',
      body: 'A body.',
    }),
  })

  expect(response.status).toBe(401)
  expect((await readJson<{ _tag: string }>(response))._tag).toBe(
    'UnauthorizedError',
  )
})

it('answers a bad page with a field-level 400 rather than a blank one', async () => {
  const response = await call('/api/forum/discussions?lessonSlug=x&page=0')

  expect(response.status).toBe(400)

  const body = await readJson<{
    _tag: string
    fields: ReadonlyArray<{ field: string; message: string }>
  }>(response)
  expect(body._tag).toBe('ValidationError')
  expect(body.fields[0]?.field).toBe('page')
  expect(body.fields[0]?.message.length).toBeGreaterThan(0)
})
