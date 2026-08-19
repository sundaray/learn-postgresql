import '@tanstack/react-start/server-only'

import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins/admin'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/d1'

import { sendOtpEmail } from '@/features/auth/server/email/send'
import { authSchema } from '@/features/auth/server/schema'

// Every host the app is served from. Better Auth builds its own base URL from
// the request host, and rejects any host outside this list, so a forged Host
// header cannot point a callback or a cookie at another site.
const allowedHosts = [
  // `alchemy dev` serves the worker from localhost.
  'localhost:*',
  'learn-postgresql-prod.*.workers.dev',
  'learn-postgresql-dev.*.workers.dev',
]

function createAuth() {
  const db = drizzle(env.DB, { schema: authSchema })
  const adminEmails = new Set(
    env.ADMIN_EMAILS.split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
  const socialProviders =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account' as const,
          },
        }
      : {}

  return betterAuth({
    baseURL: {
      allowedHosts,
      protocol: import.meta.env.DEV ? 'http' : 'https',
    },
    // Most of the auth flow (OTP verify, OAuth callback, adapter/D1 writes) runs
    // inside Better Auth, so this is where those failures surface. Verbose while
    // developing; errors-only in production.
    logger: { level: import.meta.env.DEV ? 'debug' : 'error' },
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: authSchema,
    }),
    socialProviders,
    // Rate-limit counters live in memory.
    rateLimit: {
      enabled: true,
      storage: 'memory',
      customRules: {
        // "Send code" and "Resend code" both POST to this one endpoint, so a
        // single rule caps the combined send + resend traffic at 3/min per IP.
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
      },
    },
    advanced: {
      // Rate limiting is keyed by client IP. On Cloudflare the trustworthy IP is
      // CF-Connecting-IP (clients can spoof x-forwarded-for); without this the
      // limiter could fall back to one shared bucket for every user.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
    databaseHooks: {
      user: {
        create: {
          // Assign the role once, at account creation. Doing it here (not on
          // every login) means a role later changed via the admin panel is
          // never silently overwritten on the user's next login.
          before: async (user) => {
            const role = adminEmails.has(user.email.toLowerCase())
              ? 'admin'
              : 'user'
            return { data: { ...user, role } }
          },
        },
      },
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          await sendOtpEmail({ to: email, otp, type })
        },
      }),
      // Adds the role/ban fields and the impersonation endpoints. Admins are
      // users whose role is "admin" (the plugin's default adminRoles).
      admin(),
      // tanstackStartCookies must be the last plugin so it can wrap cookie
      // handling for every other plugin's responses.
      tanstackStartCookies(),
    ],
  })
}

// Built lazily so the D1 binding (env.DB) is read inside request scope, and
// memoized so we reuse one instance across requests in the same isolate.
let authInstance: ReturnType<typeof createAuth> | undefined

export function auth() {
  authInstance ??= createAuth()
  return authInstance
}

export type Session = ReturnType<typeof createAuth>['$Infer']['Session']
