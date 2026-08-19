import { AwsClient } from 'aws4fetch'
import { Result } from 'better-result'
import { env } from 'cloudflare:workers'

import { EmailConfigMissing, EmailSendFailed, SesRejected } from './errors'
import type { EmailError } from './errors'
import { renderOtpEmail } from './templates/otp-email'

export type OtpType =
  | 'sign-in'
  | 'email-verification'
  | 'forget-password'
  | 'change-email'

export interface SendOtpInput {
  readonly to: string
  readonly otp: string
  readonly type: OtpType
}

interface EmailRuntime {
  readonly aws: AwsClient
  readonly endpoint: string
  readonly from: string
  readonly logoUrl: string
}

interface Message {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text: string
}

type SettingKey =
  | 'AWS_REGION'
  | 'SES_FROM_EMAIL'
  | 'BETTER_AUTH_URL'
  | 'AWS_ACCESS_KEY_ID'
  | 'AWS_SECRET_ACCESS_KEY'

function subjectFor(type: OtpType) {
  return type === 'sign-in'
    ? 'Your Learn PostgreSQL login code'
    : 'Your Learn PostgreSQL verification code'
}

function headlineFor(type: OtpType) {
  return type === 'sign-in'
    ? 'Your login code for Learn PostgreSQL'
    : 'Your verification code for Learn PostgreSQL'
}

/**
 * Reads one worker environment variable, failing with the key name when it is
 * absent or blank. Without this a missing secret reaches SES as an empty string
 * and comes back as an opaque signing error.
 */
function readSetting(key: SettingKey): Result<string, EmailConfigMissing> {
  const value = env[key]

  if (typeof value !== 'string' || value.trim() === '') {
    return Result.err(
      new EmailConfigMissing({
        key,
        message: `${key} is missing from the worker environment.`,
      }),
    )
  }

  return Result.ok(value)
}

/**
 * Signs requests to the SES v2 REST API with aws4fetch. The AWS SDK is skipped
 * on purpose: it is heavy and has Node-compat friction on Cloudflare Workers,
 * whereas aws4fetch is a few KB and signs a standard fetch with WebCrypto.
 * SES signs under the service name "ses" even though the host is
 * email.<region>.amazonaws.com, so the name is set explicitly. Left to itself
 * aws4fetch would infer "email" and the signature would be rejected.
 */
function loadEmailRuntime(): Result<EmailRuntime, EmailConfigMissing> {
  const region = readSetting('AWS_REGION')
  if (Result.isError(region)) return Result.err(region.error)

  const from = readSetting('SES_FROM_EMAIL')
  if (Result.isError(from)) return Result.err(from.error)

  const appUrl = readSetting('BETTER_AUTH_URL')
  if (Result.isError(appUrl)) return Result.err(appUrl.error)

  const accessKeyId = readSetting('AWS_ACCESS_KEY_ID')
  if (Result.isError(accessKeyId)) return Result.err(accessKeyId.error)

  const secretAccessKey = readSetting('AWS_SECRET_ACCESS_KEY')
  if (Result.isError(secretAccessKey)) return Result.err(secretAccessKey.error)

  return Result.ok({
    aws: new AwsClient({
      accessKeyId: accessKeyId.value,
      secretAccessKey: secretAccessKey.value,
      service: 'ses',
      region: region.value,
    }),
    endpoint: `https://email.${region.value}.amazonaws.com/v2/email/outbound-emails`,
    from: from.value,
    // The mark shown at the top of the email. Mail clients cannot resolve a
    // relative path, so it has to be absolute against the deployed origin.
    logoUrl: new URL('/favicon-192.png', appUrl.value).toString(),
  })
}

/**
 * One signed POST to the SES v2 send API. Every template goes through here so
 * the signing and the SES error mapping live in one place.
 */
async function dispatch(
  runtime: EmailRuntime,
  message: Message,
  method: string,
): Promise<Result<void, EmailError>> {
  const body = JSON.stringify({
    FromEmailAddress: runtime.from,
    Destination: { ToAddresses: [message.to] },
    Content: {
      Simple: {
        Subject: { Data: message.subject },
        Body: { Text: { Data: message.text }, Html: { Data: message.html } },
      },
    },
  })

  // tryPromise hands over an AbortSignal; threading it into the request means a
  // cancelled send drops the HTTP call instead of leaking it.
  const sent = await Result.tryPromise({
    try: ({ signal }) =>
      runtime.aws.fetch(runtime.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        // Cloudflare's RequestInit types signal as `AbortSignal | null`, and
        // exactOptionalPropertyTypes rejects an explicit undefined.
        signal: signal ?? null,
      }),
    catch: (cause) => new EmailSendFailed({ cause, message: String(cause) }),
  })

  if (Result.isError(sent)) {
    console.error('Email request failed', { method, error: sent.error })
    return Result.err(sent.error)
  }

  const response = sent.value

  // SES answered but rejected the send. That is a separate tag from a transport
  // failure because the status and body are what name the cause: an unverified
  // sender, throttling, or a recipient outside the sandbox.
  if (!response.ok) {
    const detail = await Result.tryPromise({
      try: () => response.text(),
      catch: (cause) =>
        new EmailSendFailed({ cause, message: 'SES response body unreadable' }),
    })
    const rejection = new SesRejected({
      status: response.status,
      detail: detail.unwrapOr('<no response body>'),
    })
    console.error('Email request failed', { method, error: rejection })
    return Result.err(rejection)
  }

  return Result.ok()
}

/** Renders the one-time code email and hands it to SES. */
export async function sendOtp(
  input: SendOtpInput,
): Promise<Result<void, EmailError>> {
  const runtime = loadEmailRuntime()
  if (Result.isError(runtime)) {
    console.error('Email request failed', {
      method: 'sendOtp',
      error: runtime.error,
    })
    return Result.err(runtime.error)
  }

  // React Email to HTML, plus a plain-text fallback, for the SES message.
  const { html, text } = await renderOtpEmail({
    otp: input.otp,
    headline: headlineFor(input.type),
    logoUrl: runtime.value.logoUrl,
    validMinutes: 5,
  })

  return dispatch(
    runtime.value,
    {
      to: input.to,
      subject: subjectFor(input.type),
      html,
      text,
    },
    'sendOtp',
  )
}
