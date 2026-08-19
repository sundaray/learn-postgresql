import { useEffect, useState } from 'react'

import { Card } from '@/components/ui/card'
import { EmailOtpForm } from '@/features/auth/components/email-otp-form'
import { GoogleSignInButton } from '@/features/auth/components/google-sign-in-button'

function getGoogleErrorCallbackURL(redirectTo: string) {
  const params = new URLSearchParams({ googleError: '1' })

  if (redirectTo !== '/') params.set('redirectTo', redirectTo)

  return `/login?${params.toString()}`
}

export function LoginCard({
  redirectTo = '/',
  googleError,
}: {
  // The unions are explicit because the project compiles with
  // exactOptionalPropertyTypes: the login route reads both off the search
  // params, where each is genuinely `string | undefined`.
  redirectTo?: string | undefined
  googleError?: string | undefined
}) {
  // Only one sign-in method may run at a time; the other disables while it's in flight.
  const [pending, setPending] = useState<'google' | 'otp' | null>(null)

  useEffect(() => {
    function resetPendingAfterHistoryRestore(event: PageTransitionEvent) {
      if (event.persisted) setPending(null)
    }

    window.addEventListener('pageshow', resetPendingAfterHistoryRestore)

    return () => {
      window.removeEventListener('pageshow', resetPendingAfterHistoryRestore)
    }
  }, [])

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm gap-5 p-6">
        <div className="flex flex-col gap-1.5 text-left">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Login
          </h1>
          <p className="text-left text-sm font-medium text-muted-foreground">
            Use your Google account or get a one-time code by email.
          </p>
        </div>

        <GoogleSignInButton
          pending={pending === 'google'}
          disabled={pending === 'otp'}
          callbackURL={redirectTo}
          errorCallbackURL={getGoogleErrorCallbackURL(redirectTo)}
          callbackErrorCode={googleError}
          onPendingChange={(busy) => setPending(busy ? 'google' : null)}
        />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <EmailOtpForm
          disabled={pending === 'google'}
          redirectTo={redirectTo}
          onPendingChange={(busy) => setPending(busy ? 'otp' : null)}
        />
      </Card>
    </div>
  )
}
