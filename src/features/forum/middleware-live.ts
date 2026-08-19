import '@tanstack/react-start/server-only'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { HttpServerRequest } from 'effect/unstable/http'

import { ForbiddenError, UnauthorizedError } from './errors'
import { AdminMiddleware, AuthMiddleware, CurrentUser } from './middleware'
import type { SessionUser } from './session-gateway'
import { SessionGateway } from './session-gateway'

// Decision 10: the lookup goes through a tag rather than a direct import, and
// the decisions are exported effects rather than being buried in a layer. That
// is what makes middleware.test.ts an ordinary unit test instead of something
// that needs a real session and a running server.

/**
 * Resolves whoever is signed in, or fails. Requires only the request and the
 * gateway, so a test provides a hand-built Request and a stub.
 */
export const resolveSessionUser: Effect.Effect<
  SessionUser,
  UnauthorizedError | ForbiddenError,
  SessionGateway | HttpServerRequest.HttpServerRequest
> = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const gateway = yield* SessionGateway

  const user = yield* gateway
    .findUser(request.headers)
    // A gateway failure is not part of the API contract. Better Auth being down
    // is a 500, not "you are signed out", which would quietly send a signed-in
    // reader to the login page.
    .pipe(Effect.catchTag('SessionGatewayError', Effect.die))

  if (!user) return yield* Effect.fail(new UnauthorizedError())

  // A ban ends write access immediately. Better Auth stops a banned account
  // signing in, but a session issued before the ban would otherwise keep
  // working until it expired.
  if (user.banned) return yield* Effect.fail(new ForbiddenError())

  return user
})

/**
 * The admin decision, kept separate from the lookup so it can be tested as a
 * plain function of a user.
 */
export const requireAdmin = (
  user: SessionUser,
): Effect.Effect<SessionUser, ForbiddenError> =>
  // 403 rather than 401: the caller is authenticated, just not permitted.
  user.isAdmin ? Effect.succeed(user) : Effect.fail(new ForbiddenError())

export const AuthMiddlewareLive = Layer.effect(AuthMiddleware)(
  Effect.gen(function* () {
    // Yielded while the layer is built, so the gateway is resolved once rather
    // than looked up per request.
    const gateway = yield* SessionGateway

    return AuthMiddleware.of((httpEffect) =>
      resolveSessionUser.pipe(
        Effect.provideService(SessionGateway, gateway),
        Effect.flatMap((user) =>
          Effect.provideService(httpEffect, CurrentUser, user),
        ),
      ),
    )
  }),
)

export const AdminMiddlewareLive = Layer.effect(AdminMiddleware)(
  Effect.gen(function* () {
    const gateway = yield* SessionGateway

    return AdminMiddleware.of((httpEffect) =>
      resolveSessionUser.pipe(
        Effect.provideService(SessionGateway, gateway),
        Effect.flatMap(requireAdmin),
        Effect.flatMap((user) =>
          Effect.provideService(httpEffect, CurrentUser, user),
        ),
      ),
    )
  }),
)
