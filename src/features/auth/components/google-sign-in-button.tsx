import { useState } from 'react'

import { Icons } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { signInGoogle } from '@/features/auth/server/auth.functions'

const GOOGLE_SIGN_IN_START_ERROR = "Google login couldn't start. Try again."
const GOOGLE_SIGN_IN_CALLBACK_ERROR =
  "Google login couldn't be completed. Try again."
const GOOGLE_SIGN_IN_CANCELED_ERROR = 'Google login was canceled.'

function getCallbackErrorMessage(errorCode: string | undefined) {
  if (!errorCode) return null

  return errorCode === 'access_denied'
    ? GOOGLE_SIGN_IN_CANCELED_ERROR
    : GOOGLE_SIGN_IN_CALLBACK_ERROR
}

export function GoogleSignInButton({
  pending = false,
  disabled = false,
  callbackURL = '/',
  errorCallbackURL = '/login?googleError=1',
  callbackErrorCode,
  onPendingChange,
}: {
  pending?: boolean
  disabled?: boolean
  /** Where Better Auth returns the browser after the Google round-trip completes. */
  callbackURL?: string
  /** Where Better Auth returns the browser if the Google round-trip fails. */
  errorCallbackURL?: string
  callbackErrorCode?: string | undefined
  onPendingChange: (busy: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [hiddenCallbackErrorCode, setHiddenCallbackErrorCode] = useState<
    string | undefined
  >()
  const callbackError = getCallbackErrorMessage(callbackErrorCode)
  const visibleError =
    error ??
    (callbackErrorCode === hiddenCallbackErrorCode ? null : callbackError)

  async function signInWithGoogle() {
    setError(null)
    setHiddenCallbackErrorCode(callbackErrorCode)
    onPendingChange(true)

    const result = await signInGoogle({
      data: { callbackURL, errorCallbackURL },
    })

    if (!result.ok) {
      setError(result.message || GOOGLE_SIGN_IN_START_ERROR)
      onPendingChange(false)
      return
    }

    const url = result.url
    if (url) {
      window.location.href = url
      return
    }

    setError(GOOGLE_SIGN_IN_START_ERROR)
    onPendingChange(false)
  }

  const isDisabled = pending || disabled

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full text-sm"
        disabled={isDisabled}
        onClick={signInWithGoogle}
      >
        {pending ? <Spinner /> : <Icons.google className="size-4.5" />}
        Login with Google
      </Button>
      {visibleError ? (
        <p className="text-sm text-pretty text-destructive">{visibleError}</p>
      ) : null}
    </div>
  )
}
