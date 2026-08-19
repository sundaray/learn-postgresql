import { Result } from 'better-result'

import { sendOtp } from './service'
import type { SendOtpInput } from './service'

/**
 * Bridge for Better Auth's sendVerificationOTP callback, which is a plain
 * promise API: it treats a rejection as "the code was not sent" and reports
 * that to the caller. The throw is reached from the Result branch rather than
 * from a catch block, so the failure is still a value up to this point.
 */
export async function sendOtpEmail(input: SendOtpInput): Promise<void> {
  const sent = await sendOtp(input)

  if (Result.isError(sent)) {
    throw sent.error
  }
}
