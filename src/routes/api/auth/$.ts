import { createFileRoute } from '@tanstack/react-router'

import { authHandler } from '@/features/auth/server/handler'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => authHandler(request),
      POST: ({ request }) => authHandler(request),
    },
  },
})
