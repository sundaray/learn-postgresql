import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

// A Gateway rather than a Repository, because it wraps Better Auth's API rather
// than our own SQL. If the session lookup ever reads the session table directly
// it becomes a Repository.

// The only things the forum needs to know about whoever is signed in. Notably
// not the raw `role` column, and not `email`: section 8 keeps the user table's
// sensitive columns out of every shape that can reach a response.
export interface SessionUser {
  readonly id: string
  readonly isAdmin: boolean
  readonly banned: boolean
}

export class SessionGatewayError extends Schema.TaggedError<SessionGatewayError>()(
  'SessionGatewayError',
  { cause: Schema.String },
) {}

export class SessionGateway extends Context.Service<
  SessionGateway,
  {
    // Takes the request headers as a plain record so the port carries no
    // platform types. Null means no valid session, which is a normal outcome on
    // a forum where reading needs no account.
    readonly findUser: (
      headers: Readonly<Record<string, string>>,
    ) => Effect.Effect<SessionUser | null, SessionGatewayError>
  }
>()('SessionGateway') {}
