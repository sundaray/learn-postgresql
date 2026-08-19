import { createFileRoute } from '@tanstack/react-router'
import { createCsrfMiddleware } from '@tanstack/react-start'

// Imported straight from the module rather than through a feature barrel. The
// barrel is what client components will import, and web-handler.ts is
// server-only; putting it behind the same entry point is how the drizzle client
// would end up in the browser bundle.
import { forumWebHandler } from '@/features/forum/web-handler'

// Mirrors src/routes/api/auth/$.ts: one handler file, keyed by method, each
// handing the raw Request to a web handler.
//
// TanStack Start installs CSRF middleware automatically, but only for server
// functions. The forum's writes are not server functions, they are HTTP calls
// to this route, so the middleware goes on by hand. What blocks a cross-site
// POST today is Better Auth's session cookie defaulting to SameSite=Lax, which
// is real but implicit, lives in another feature's defaults, and disappears the
// day anyone sets sameSite: 'none'.
//
// The filter is not optional. With no options the middleware validates every
// request it handles, and rejects one carrying no Sec-Fetch-Site, Origin or
// Referer, because allowRequestsWithoutOriginCheck defaults to false. A crawler
// fetching a discussion sends none of the three. Reads are public and
// idempotent and there is nothing to forge, so validation is scoped to the
// methods that change something, which is the whole reason the middleware is
// here.
const csrf = createCsrfMiddleware({
  filter: ({ request }) => request.method !== 'GET' && request.method !== 'HEAD',
})

export const Route = createFileRoute('/api/forum/$')({
  server: {
    middleware: [csrf],
    handlers: {
      GET: ({ request }) => forumWebHandler(request),
      POST: ({ request }) => forumWebHandler(request),
      DELETE: ({ request }) => forumWebHandler(request),
    },
  },
})
