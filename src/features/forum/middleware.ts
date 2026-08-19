import * as Context from 'effect/Context'
import { HttpApiMiddleware } from 'effect/unstable/httpapi'

import { ForbiddenError, UnauthorizedError } from './errors'
import type { SessionUser } from './session-gateway'

// Tags only. This file is reachable from api.ts, which the client atoms import,
// so nothing here may pull in Better Auth, drizzle or cloudflare:workers. The
// implementations live in middleware-live.ts.

// What every authenticated endpoint reads to learn who is acting. The actor
// always comes from here, never from a request payload.
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()(
  'forum/CurrentUser',
) {}

// No `security` scheme: the session rides Better Auth's cookie, and the
// middleware hands the whole header set to the gateway rather than decoding a
// credential itself.
export class AuthMiddleware extends HttpApiMiddleware.Service<
  AuthMiddleware,
  {
    provides: CurrentUser
    requires: never
  }
>()('forum/AuthMiddleware', {
  error: [UnauthorizedError, ForbiddenError],
}) {}

// Provides the same CurrentUser, so the two are interchangeable to the
// compiler. That is exactly why section 8 requires a test per admin endpoint
// proving an ordinary signed-in user gets a 403: nothing in the type system
// would catch AuthMiddleware being used where AdminMiddleware was meant.
export class AdminMiddleware extends HttpApiMiddleware.Service<
  AdminMiddleware,
  {
    provides: CurrentUser
    requires: never
  }
>()('forum/AdminMiddleware', {
  error: [UnauthorizedError, ForbiddenError],
}) {}
