/// <reference types="vite/client" />

import type { ReactNode } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { Agentation } from 'agentation'

import { NavigationProgress } from '@/components/navigation-progress'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ImpersonationBanner } from '@/features/auth/components/impersonation-banner'
import { getSession } from '@/features/auth/server/auth.functions'

import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  // Read once, on the server, so the first paint already knows whether the
  // visitor is logged in. Every route below reads it from context rather than
  // asking again; router.invalidate() is what refreshes it after a login or a
  // sign-out.
  beforeLoad: async () => {
    const session = await getSession()

    return { session }
  },
  staleTime: Number.POSITIVE_INFINITY,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'Learn PostgreSQL' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // The elephant mark on a transparent ground, rendered from
      // src/assets/learn-postgresql-icon.svg by scripts/generate-favicons.mjs.
      // Modern browsers prefer the SVG; the PNG/ICO fallbacks below are for
      // Safari, bookmarks, and the auto-requested /favicon.ico.
      {
        rel: 'icon',
        href: '/favicon.svg',
        type: 'image/svg+xml',
      },
      {
        rel: 'icon',
        href: '/favicon-32.png',
        type: 'image/png',
        sizes: '32x32',
      },
      {
        rel: 'icon',
        href: '/favicon-16.png',
        type: 'image/png',
        sizes: '16x16',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
        sizes: '180x180',
      },
      {
        rel: 'manifest',
        href: '/site.webmanifest',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  const { session } = Route.useRouteContext()

  return (
    <RootDocument>
      <Outlet />
      <ImpersonationBanner session={session} />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <NavigationProgress />
        <TooltipProvider>{children}</TooltipProvider>
        {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
        <Scripts />
      </body>
    </html>
  )
}
