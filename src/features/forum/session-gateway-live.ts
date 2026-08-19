import '@tanstack/react-start/server-only'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { auth } from '@/features/auth/server/auth'

import type { SessionUser } from './session-gateway'
import { SessionGateway, SessionGatewayError } from './session-gateway'

// The only file in the forum that touches the Better Auth instance. Everything
// else depends on the SessionGateway tag, which is what lets the middleware be
// unit tested against a stub.
//
// There is no unit test for this adapter. It is a mapping with no branches
// worth stubbing Better Auth to reach, and the step 10 workerd tests drive it
// with real sessions against real D1, which is the only thing that would catch
// a mistake here.

export const SessionGatewayLive = Layer.succeed(SessionGateway, {
  findUser: (headers: Readonly<Record<string, string>>) =>
    Effect.tryPromise({
      try: () => auth().api.getSession({ headers: new Headers(headers) }),
      catch: (cause) => new SessionGatewayError({ cause: String(cause) }),
    }).pipe(
      Effect.map((session): SessionUser | null => {
        if (!session?.user) return null

        const user = session.user as {
          readonly id: string
          readonly role?: string | null | undefined
          readonly banned?: boolean | null | undefined
        }

        return {
          id: user.id,
          // Derived here, so the raw role column never travels any further.
          // Admin is role === 'admin', matching the admin() plugin's default.
          isAdmin: user.role === 'admin',
          banned: user.banned === true,
        }
      }),
      Effect.tapError((error) =>
        Effect.logError('Session lookup failed', error).pipe(
          Effect.annotateLogs({ method: 'SessionGateway.findUser' }),
        ),
      ),
    ),
})
