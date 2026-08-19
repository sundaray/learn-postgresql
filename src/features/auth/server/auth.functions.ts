import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeaders } from '@tanstack/react-start/server'
import { isAPIError } from 'better-auth/api'
import { Result, TaggedError } from 'better-result'

import { auth } from '@/features/auth/server/auth'

interface BetterAuthSession {
  readonly user: {
    readonly id: string
    readonly email: string
    readonly name?: string | null | undefined
    readonly image?: string | null | undefined
    readonly role?: string | null | undefined
  }
  readonly session: {
    readonly id: string
    readonly userId: string
    readonly expiresAt: Date | string
    readonly impersonatedBy?: string | null | undefined
  }
}

export interface AppSession {
  readonly user: {
    readonly id: string
    readonly email: string
    readonly name: string | null
    readonly image: string | null
    readonly role: string
  }
  readonly session: {
    readonly id: string
    readonly userId: string
    readonly expiresAt: string
    readonly impersonatedBy: string | null
  }
}

export type CurrentSession = AppSession | null

export interface AuthFailure {
  readonly ok: false
  readonly status: number
  readonly message: string
}

export type AuthActionResult = { readonly ok: true } | AuthFailure

export type SignInGoogleResult =
  | { readonly ok: true; readonly url: string | null }
  | AuthFailure

/** A Better Auth API call rejected. Carries the status the API reported. */
export class AuthCallFailed extends TaggedError('AuthCallFailed')<{
  cause: unknown
  status: number
  message: string
}> {}

/** Reading the session from the request failed. */
export class SessionReadFailed extends TaggedError('SessionReadFailed')<{
  cause: unknown
}> {}

const AUTH_ERROR_MESSAGE = 'Authentication failed. Please try again.'

function serializeSession(session: BetterAuthSession | null): CurrentSession {
  if (!session) return null

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
      role: session.user.role ?? 'user',
    },
    session: {
      id: session.session.id,
      userId: session.session.userId,
      expiresAt:
        session.session.expiresAt instanceof Date
          ? session.session.expiresAt.toISOString()
          : session.session.expiresAt,
      impersonatedBy: session.session.impersonatedBy ?? null,
    },
  }
}

// Better Auth rejects with an APIError carrying the HTTP status and a body the
// UI can show (for example "invalid OTP"). Anything else is unexpected, so it
// gets a generic message and a 500.
function authCallFailed(cause: unknown): AuthCallFailed {
  if (isAPIError(cause)) {
    return new AuthCallFailed({
      cause,
      status: cause.statusCode,
      message: cause.body?.message ?? cause.message ?? AUTH_ERROR_MESSAGE,
    })
  }

  return new AuthCallFailed({
    cause,
    status: 500,
    message: AUTH_ERROR_MESSAGE,
  })
}

// The serializable failure the client components branch on, logged on the way
// out so the real cause stays in the worker logs.
function reportFailure(error: AuthCallFailed): AuthFailure {
  console.error('Auth action failed', {
    status: error.status,
    message: error.message,
    cause: error.cause,
  })

  return { ok: false, status: error.status, message: error.message }
}

function applyAuthHeaders(headers: Headers) {
  setResponseHeaders(headers)
}

interface EmailPayload {
  readonly email: string
}

interface EmailOtpPayload {
  readonly email: string
  readonly otp: string
}

interface GooglePayload {
  readonly callbackURL?: string
  readonly errorCallbackURL?: string
}

interface UserIdPayload {
  readonly userId: string
}

// Reads the session on the server so the first render already knows whether the
// user is logged in. Without this the menu flashes "Login" before the
// client-side session read resolves and swaps it for "Account".
export const getSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CurrentSession> => {
    // This runs in the root route on every server render, so a failed session
    // read (D1 hiccup, cold-start binding issue) would otherwise fail the whole
    // page render with nothing logged. Log the real cause and degrade to
    // "signed out" instead.
    const session = await Result.tryPromise({
      try: () => auth().api.getSession({ headers: getRequest().headers }),
      catch: (cause) => new SessionReadFailed({ cause }),
    })

    if (Result.isError(session)) {
      console.error('Failed to read session', session.error.cause)
      return null
    }

    return serializeSession(session.value)
  },
)

export const sendEmailOtp = createServerFn({ method: 'POST' })
  .validator((data: EmailPayload) => data)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const sent = await Result.tryPromise({
      try: () =>
        auth().api.sendVerificationOTP({
          body: { email: data.email, type: 'sign-in' },
          headers: getRequest().headers,
        }),
      catch: authCallFailed,
    })

    if (Result.isError(sent)) return reportFailure(sent.error)

    return { ok: true }
  })

export const signInEmailOtp = createServerFn({ method: 'POST' })
  .validator((data: EmailOtpPayload) => data)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const signedIn = await Result.tryPromise({
      try: () =>
        auth().api.signInEmailOTP({
          body: { email: data.email, otp: data.otp },
          headers: getRequest().headers,
          returnHeaders: true,
        }),
      catch: authCallFailed,
    })

    if (Result.isError(signedIn)) return reportFailure(signedIn.error)

    applyAuthHeaders(signedIn.value.headers)

    return { ok: true }
  })

export const signInGoogle = createServerFn({ method: 'POST' })
  .validator((data: GooglePayload) => data)
  .handler(async ({ data }): Promise<SignInGoogleResult> => {
    const started = await Result.tryPromise({
      try: () =>
        auth().api.signInSocial({
          body: {
            provider: 'google',
            callbackURL: data.callbackURL,
            errorCallbackURL: data.errorCallbackURL,
          },
          headers: getRequest().headers,
          returnHeaders: true,
        }),
      catch: authCallFailed,
    })

    if (Result.isError(started)) return reportFailure(started.error)

    applyAuthHeaders(started.value.headers)

    return { ok: true, url: started.value.response.url ?? null }
  })

export const signOut = createServerFn({ method: 'POST' }).handler(
  async (): Promise<AuthActionResult> => {
    const signedOut = await Result.tryPromise({
      try: () =>
        auth().api.signOut({
          headers: getRequest().headers,
          returnHeaders: true,
        }),
      catch: authCallFailed,
    })

    if (Result.isError(signedOut)) return reportFailure(signedOut.error)

    applyAuthHeaders(signedOut.value.headers)

    return { ok: true }
  },
)

export const impersonateUser = createServerFn({ method: 'POST' })
  .validator((data: UserIdPayload) => data)
  .handler(async ({ data }): Promise<AuthActionResult> => {
    const impersonated = await Result.tryPromise({
      try: () =>
        auth().api.impersonateUser({
          body: { userId: data.userId },
          headers: getRequest().headers,
          returnHeaders: true,
        }),
      catch: authCallFailed,
    })

    if (Result.isError(impersonated)) return reportFailure(impersonated.error)

    applyAuthHeaders(impersonated.value.headers)

    return { ok: true }
  })

export const stopImpersonating = createServerFn({ method: 'POST' }).handler(
  async (): Promise<AuthActionResult> => {
    const stopped = await Result.tryPromise({
      try: () =>
        auth().api.stopImpersonating({
          headers: getRequest().headers,
          returnHeaders: true,
        }),
      catch: authCallFailed,
    })

    if (Result.isError(stopped)) return reportFailure(stopped.error)

    applyAuthHeaders(stopped.value.headers)

    return { ok: true }
  },
)

export interface AppUserRow {
  readonly id: string
  readonly email: string
  readonly role: string
}

// Admin-only: lists all users for the admin page (admins included, so the admin
// sees their own row too). Access is enforced by the admin plugin via the
// forwarded request headers; a non-admin caller gets a rejection, which becomes
// an empty list here. The UI hides Impersonate on admin rows, since you cannot
// impersonate yourself.
export const getUsers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AppUserRow[]> => {
    const listed = await Result.tryPromise({
      try: () =>
        auth().api.listUsers({
          headers: getRequest().headers,
          query: { limit: 100, sortBy: 'createdAt', sortDirection: 'desc' },
        }),
      catch: authCallFailed,
    })

    if (Result.isError(listed)) {
      console.error('Failed to list users', listed.error.cause)
      return []
    }

    return listed.value.users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role ?? 'user',
    }))
  },
)
