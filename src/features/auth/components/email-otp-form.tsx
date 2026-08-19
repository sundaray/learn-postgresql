import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useRouter } from '@tanstack/react-router'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import {
  sendEmailOtp,
  signInEmailOtp,
} from '@/features/auth/server/auth.functions'

const EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-\.]*)[a-z0-9_+-]@([a-z0-9][a-z0-9\-]*\.)+[a-z]{2,}$/i

const EmailFormSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .regex(EMAIL_REGEX, 'Enter a valid email address'),
})

type EmailFormValues = z.infer<typeof EmailFormSchema>

const OtpFormSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

type OtpFormValues = z.infer<typeof OtpFormSchema>

export function EmailOtpForm({
  disabled = false,
  redirectTo = '/',
  onPendingChange,
}: {
  disabled?: boolean
  /** Where to send the user once the code verifies (the page they came from). */
  redirectTo?: string
  onPendingChange: (busy: boolean) => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)
  const [action, setAction] = useState<'send' | 'verify' | 'resend' | null>(null)
  const emailForm = useForm<EmailFormValues>({
    resolver: standardSchemaResolver(EmailFormSchema),
    defaultValues: { email: '' },
  })
  const otpForm = useForm<OtpFormValues>({
    resolver: standardSchemaResolver(OtpFormSchema),
    defaultValues: { otp: '' },
  })

  const busy = action !== null || disabled

  async function requestCode(which: 'send' | 'resend', emailAddress = email) {
    setError(null)
    setResendError(null)
    setAction(which)
    onPendingChange(true)
    const result = await sendEmailOtp({ data: { email: emailAddress } })
    setAction(null)
    onPendingChange(false)
    if (!result.ok) {
      const message =
        result.status === 429
          ? "You've hit the resend limit. Please wait a minute and try again."
          : 'Could not send a code. Please try again.'
      if (which === 'resend') setResendError(message)
      else setError(message)
      return false
    }
    return true
  }

  const handleSendCode = emailForm.handleSubmit(async (values) => {
    if (await requestCode('send', values.email)) {
      setEmail(values.email)
      otpForm.reset({ otp: '' })
      setStep('otp')
    }
  })

  async function verifyCode(code: string) {
    if (action !== null) return
    // Keep any prior error (and its red invalid state) visible while we re-check.
    // On success we navigate away; on failure we re-set the error below. This
    // avoids the cells briefly flashing to their normal focus state.
    setAction('verify')
    onPendingChange(true)
    const result = await signInEmailOtp({
      data: {
        email,
        otp: code,
      },
    })
    setAction(null)
    onPendingChange(false)
    if (!result.ok) {
      otpForm.reset({ otp: '' })
      setError(
        result.message ||
          'That code is invalid or has expired. Request a new one.',
      )
      return
    }
    await router.invalidate()
    // history.push (not navigate) so the destination can be any sanitized path
    // string; the target route's beforeLoad re-runs and now sees the session.
    router.history.push(redirectTo)
  }

  const handleVerifyCode = otpForm.handleSubmit((values) =>
    verifyCode(values.otp),
  )

  if (step === 'email') {
    return (
      <form className="flex flex-col gap-3" noValidate onSubmit={handleSendCode}>
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <Input
              id="email"
              type="email"
              className="peer h-14 px-3.5 pt-5 pb-1 placeholder:text-transparent"
              autoComplete="email"
              placeholder="you@example.com"
              disabled={busy}
              aria-invalid={!!emailForm.formState.errors.email}
              {...emailForm.register('email')}
            />
            {/* Floating label lives entirely inside the input: it rests where the
                value sits (like a placeholder), then floats up to the top-left
                (primary color, smaller) on focus or when the field has a value.
                The input's pt-5 keeps the typed text clear of the floated label. */}
            <label
              htmlFor="email"
              className="pointer-events-none absolute top-0 left-3.5 translate-y-4 text-base text-muted-foreground transition-all peer-focus:translate-y-1.5 peer-focus:text-xs peer-focus:text-primary peer-not-placeholder-shown:translate-y-1.5 peer-not-placeholder-shown:text-xs peer-aria-invalid:text-destructive"
            >
              Email
            </label>
          </div>
          {emailForm.formState.errors.email?.message ? (
            <p className="text-sm text-pretty text-destructive">
              {emailForm.formState.errors.email.message}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-pretty text-destructive">{error}</p>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {action === 'send' ? <Spinner /> : null}
          Send code
        </Button>
      </form>
    )
  }

  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={handleVerifyCode}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="otp" className="text-sm font-medium">
          Enter the 6-digit code
        </label>
        <p className="text-sm font-normal text-muted-foreground">
          We sent a code to {email}
        </p>
        <Controller
          control={otpForm.control}
          name="otp"
          render={({ field }) => (
            <InputOTP
              id="otp"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              autoComplete="one-time-code"
              autoFocus
              value={field.value}
              disabled={busy}
              aria-invalid={!!otpForm.formState.errors.otp || !!error}
              onChange={field.onChange}
              onComplete={(code) => {
                field.onChange(code)
                void verifyCode(code)
              }}
              containerClassName="mt-[3px] w-full"
            >
              <InputOTPGroup className="w-full">
                <InputOTPSlot index={0} className="h-14 flex-1 text-base" />
                <InputOTPSlot index={1} className="h-14 flex-1 text-base" />
                <InputOTPSlot index={2} className="h-14 flex-1 text-base" />
                <InputOTPSlot index={3} className="h-14 flex-1 text-base" />
                <InputOTPSlot index={4} className="h-14 flex-1 text-base" />
                <InputOTPSlot index={5} className="h-14 flex-1 text-base" />
              </InputOTPGroup>
            </InputOTP>
          )}
        />
        {otpForm.formState.errors.otp?.message ? (
          <p className="text-sm text-pretty text-destructive">
            {otpForm.formState.errors.otp.message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-pretty text-destructive">{error}</p>
        ) : null}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {action === 'verify' ? <Spinner /> : null}
        Verify and login
      </Button>
      <div className="flex items-center justify-between text-sm font-normal text-muted-foreground">
        <button
          type="button"
          className="hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            setStep('email')
            otpForm.reset({ otp: '' })
            setError(null)
            setResendError(null)
          }}
        >
          Use a different email
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            void requestCode('resend')
          }}
        >
          {action === 'resend' ? <Spinner className="size-3" /> : null}
          Resend code
        </button>
      </div>
      {resendError ? (
        <p className="text-sm text-pretty text-destructive">{resendError}</p>
      ) : null}
    </form>
  )
}
