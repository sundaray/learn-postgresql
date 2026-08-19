import type { CSSProperties } from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { render } from '@react-email/render'

export interface OtpEmailProps {
  readonly otp: string
  /** Varies by OTP type, e.g. "Your login code for Learn PostgreSQL". */
  readonly headline: string
  /** Must be absolute: email clients cannot resolve a relative or SVG logo. */
  readonly logoUrl: string
  readonly validMinutes?: number
}

export function OtpEmail({
  otp,
  headline,
  logoUrl,
  validMinutes = 5,
}: OtpEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{headline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src={logoUrl}
            width="40"
            height="40"
            alt="Learn PostgreSQL"
            style={logo}
          />
          <Heading style={heading}>{headline}</Heading>
          <Section>
            <Text style={code}>{otp}</Text>
          </Section>
          <Text style={validity}>
            This code will only be valid for the next {validMinutes} minutes.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Learn PostgreSQL</Text>
        </Container>
      </Body>
    </Html>
  )
}

// Render to both an HTML string and a plain-text fallback for the SES message.
export async function renderOtpEmail(
  props: OtpEmailProps,
): Promise<{ html: string; text: string }> {
  const element = <OtpEmail {...props} />
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return { html, text }
}

const main: CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

const container: CSSProperties = {
  margin: '0 auto',
  maxWidth: '480px',
  padding: '40px 24px',
}

const logo: CSSProperties = { display: 'block' }

// Email HTML is inlined for mail clients (no CSS variables, no Tailwind), so
// colors are literal hex from the Tailwind `neutral` ramp to match the shadcn
// base color: 100 #f5f5f5, 200 #e5e5e5, 400 #a3a3a3, 600 #525252, 900 #171717.
const heading: CSSProperties = {
  margin: '24px 0',
  fontSize: '24px',
  fontWeight: 600,
  color: '#171717', // neutral-900
}

const code: CSSProperties = {
  display: 'inline-block',
  margin: 0,
  padding: '12px 20px',
  backgroundColor: '#f5f5f5', // neutral-100
  borderRadius: '8px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '6px',
  color: '#171717', // neutral-900
}

const validity: CSSProperties = {
  margin: '24px 0 0',
  fontSize: '14px',
  lineHeight: '24px',
  color: '#525252', // neutral-600
}

const hr: CSSProperties = {
  // Top gap (above the rule) stays 32px; bottom gap (to the footer) is 16px.
  margin: '32px 0 16px',
  borderColor: '#e5e5e5', // neutral-200
}

const footer: CSSProperties = {
  margin: 0,
  fontSize: '14px',
  color: '#a3a3a3', // neutral-400
}
