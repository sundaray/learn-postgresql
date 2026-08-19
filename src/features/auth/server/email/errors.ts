import { TaggedError } from 'better-result'

/** A variable the SES sender needs was missing or empty in the worker env. */
export class EmailConfigMissing extends TaggedError('EmailConfigMissing')<{
  key: string
  message: string
}> {}

/**
 * The request to SES never completed (network or transport failure, for
 * example a rejected fetch, DNS, or an aborted request). No HTTP response
 * came back.
 */
export class EmailSendFailed extends TaggedError('EmailSendFailed')<{
  cause: unknown
  message: string
}> {}

/**
 * SES answered, but rejected the send with a non-2xx status. Kept apart from
 * EmailSendFailed so a provider rejection (unverified sender, throttling,
 * sandbox recipient) is distinguishable from a transport failure.
 */
export class SesRejected extends TaggedError('SesRejected')<{
  status: number
  detail: string
}> {}

export type EmailError = EmailConfigMissing | EmailSendFailed | SesRejected
