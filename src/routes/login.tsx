import { createFileRoute } from '@tanstack/react-router'

import { MainNavbar } from '@/components/main-navbar'
import { LoginCard } from '@/features/auth/components/login-card'
import { SITE_NAME } from '@/lib/site'

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// Only same-origin paths are accepted, so a crafted ?redirectTo= cannot bounce
// a freshly signed-in user off to another site.
function optionalAppPath(value: unknown) {
  const path = optionalString(value)

  return path?.startsWith('/') && !path.startsWith('//') ? path : undefined
}

interface LoginSearch {
  redirectTo?: string
  googleError?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const result: LoginSearch = {}
    const redirectTo = optionalAppPath(search.redirectTo)
    const googleError =
      search.googleError === '1' ? optionalString(search.error) : undefined

    if (redirectTo) result.redirectTo = redirectTo
    if (googleError) result.googleError = googleError

    return result
  },
  head: () => ({
    meta: [{ title: `Login | ${SITE_NAME}` }, { name: 'robots', content: 'noindex' }],
  }),
  component: LoginPage,
})

function LoginPage() {
  const { redirectTo, googleError } = Route.useSearch()

  return (
    <>
      <MainNavbar />

      <main>
        <LoginCard redirectTo={redirectTo} googleError={googleError} />
      </main>
    </>
  )
}
