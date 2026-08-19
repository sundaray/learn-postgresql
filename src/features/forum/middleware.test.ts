import { describe, expect, it } from 'vitest'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { HttpServerRequest } from 'effect/unstable/http'

import { requireAdmin, resolveSessionUser } from './middleware-live'
import type { SessionUser } from './session-gateway'
import { SessionGateway } from './session-gateway'

// Decision 10 is what makes this file possible. The auth skill builds the
// middleware with Layer.succeed calling the Better Auth instance inline, which
// is a direct import rather than a tag: nothing to swap, and nothing to test
// without standing up HTTP and a real session. Here the lookup is behind
// SessionGateway and the decision is an exported effect, so both are ordinary
// unit tests over a hand-built Request.

const reader: SessionUser = { id: 'user_1', isAdmin: false, banned: false }
const admin: SessionUser = { id: 'user_2', isAdmin: true, banned: false }
const bannedReader: SessionUser = { id: 'user_3', isAdmin: false, banned: true }

function gatewayReturning(user: SessionUser | null) {
  return Layer.succeed(SessionGateway, {
    findUser: () => Effect.succeed(user),
  })
}

// The middleware reads whatever the request carries and hands it to the
// gateway. Nothing here parses a cookie, which is Better Auth's job.
function request(cookie?: string) {
  return HttpServerRequest.fromWeb(
    new Request('http://forum.test/api/forum/discussions', {
      headers: cookie === undefined ? {} : { cookie },
    }),
  )
}

const runWith = <A, E>(
  effect: Effect.Effect<A, E, SessionGateway | HttpServerRequest.HttpServerRequest>,
  user: SessionUser | null,
  cookie?: string,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request(cookie)),
      Effect.provide(gatewayReturning(user)),
    ),
  )

describe('resolveSessionUser', () => {
  it('returns the signed-in user', async () => {
    const user = await runWith(resolveSessionUser, reader, 'session=abc')

    expect(user).toEqual(reader)
  })

  it('fails with UnauthorizedError when there is no session', async () => {
    const error = await runWith(Effect.flip(resolveSessionUser), null)

    expect(error._tag).toBe('UnauthorizedError')
  })

  it('passes the request headers through to the gateway', async () => {
    const seen: Array<Readonly<Record<string, string>>> = []
    const recordingGateway = Layer.succeed(SessionGateway, {
      findUser: (headers) =>
        Effect.sync(() => {
          seen.push(headers)
          return reader
        }),
    })

    await Effect.runPromise(
      resolveSessionUser.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          request('session=abc'),
        ),
        Effect.provide(recordingGateway),
      ),
    )

    expect(seen[0]?.cookie).toBe('session=abc')
  })

  it('refuses a banned user even with a valid session', async () => {
    const error = await runWith(Effect.flip(resolveSessionUser), bannedReader)

    // A ban has to end write access straight away. Better Auth blocks a banned
    // account from signing in, but a session issued before the ban would
    // otherwise keep working until it expired.
    expect(error._tag).toBe('ForbiddenError')
  })
})

describe('requireAdmin', () => {
  it('passes an admin through unchanged', async () => {
    const user = await Effect.runPromise(requireAdmin(admin))

    expect(user).toEqual(admin)
  })

  it('fails with ForbiddenError for an ordinary signed-in user', async () => {
    const error = await Effect.runPromise(Effect.flip(requireAdmin(reader)))

    // 403, not 401. The caller is authenticated; they are simply not allowed.
    expect(error._tag).toBe('ForbiddenError')
  })
})
