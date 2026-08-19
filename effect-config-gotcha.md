# Effect Config Gotcha: Eager Layer Config Can Break Unrelated APIs

## What Happened

The `/api/credits/balance` endpoint was returning a generic `500 HTTPError` even though the credits code and D1 migrations were fine.

The root cause was not credits. It was email configuration.

`EmailServiceLive` was built with `Layer.effect(...)`, and the layer loaded SES/email config during service construction:

```ts
const config = yield* loadConfig(EmailConfig, "email")
```

Because `EmailServiceLive` was provided to the shared API layer, the whole API layer tried to construct the email service before routing requests. Missing email env vars caused `InvalidConfigError`, so unrelated endpoints like `/api/credits/balance` failed before their own handlers ran.

## Why This Is Dangerous

Effect layers are dependency construction. If a `Layer.effect(...)` reads required config, that config becomes required for anything that depends on the layer.

That is fine for truly global requirements, but it is wrong for feature-specific requirements.

In this case, SES config should be required only when sending email. It should not be required for reading a credit balance.

## The Symptom

Cloudflare surfaced only:

```json
{"status":500,"unhandled":true,"message":"HTTPError"}
```

Local `alchemy dev --stage preview` showed the real cause:

```txt
InvalidConfigError
cause: { key: "email" }
status: 500
unhandled: true
```

The important clue was that even `/api/does-not-exist` returned `500`. That meant routing itself was not healthy. The failure happened while constructing the API layer, before endpoint matching.

## The Specific Trigger

The email config used required values:

```ts
const EmailConfig = Config.all({
  region: Config.nonEmptyString("AWS_REGION"),
  from: Config.nonEmptyString("SES_FROM_EMAIL"),
  appUrl: Config.url("BETTER_AUTH_URL"),
  accessKeyId: Config.redacted("AWS_ACCESS_KEY_ID"),
  secretAccessKey: Config.redacted("AWS_SECRET_ACCESS_KEY"),
})
```

Alchemy was binding some unset env vars as empty strings:

```ts
AWS_REGION: process.env.AWS_REGION ?? ""
SES_FROM_EMAIL: process.env.SES_FROM_EMAIL ?? ""
BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? ""
```

`Config.nonEmptyString(...)` fails for empty strings, and `Config.url(...)` fails for invalid or empty URLs. That is correct behavior, but the config was being read in the wrong place.

## The Anti-Pattern

Avoid this for optional or feature-specific config:

```ts
export const EmailServiceLive = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const config = yield* loadConfig(EmailConfig, "email")

    return EmailService.of({
      sendOtp: (input) => sendWithConfig(config, input),
    })
  }),
)
```

This makes email config a startup requirement for every endpoint that receives `EmailServiceLive`, even endpoints that never send email.

## The Correct Pattern

Construct the service without reading feature-specific config:

```ts
export const EmailServiceLive = Layer.succeed(
  EmailService,
  EmailService.of({
    sendOtp: (input) =>
      Effect.gen(function* () {
        const config = yield* loadConfig(EmailConfig, "email")
        return yield* sendWithConfig(config, input)
      }),
  }),
)
```

Now missing email config breaks email sending only. It does not break unrelated API endpoints.

## Rule Of Thumb

Load config at layer construction only when the config is truly required for the entire dependency graph to exist.

Examples where eager config can be acceptable:

- A database binding required by every API endpoint.
- A base app stage value required to construct every service.
- A global crypto secret required by every request path.

Examples where config should be lazy:

- SES/AWS email config.
- SQS queue URLs used only when dispatching jobs.
- R2 temporary credential config used only when creating upload/download credentials.
- Third-party API keys used by one feature.
- Optional integrations.

## How To Handle Lazy Config Errors

When config is loaded inside a method, include `InvalidConfigError` in that method's error type, or map it to a feature-level error.

For example:

```ts
type EmailServiceError = InvalidConfigError | EmailSendError | SesError
```

For background workflows, do not let missing optional config crash the whole workflow if the operation is non-critical. Convert it into a recorded failed side effect:

```ts
Effect.catchTags({
  InvalidConfigError: () =>
    Effect.succeed({
      status: "failed",
      errorMessage: "Email configuration is missing.",
    }),
  EmailSendError: () =>
    Effect.succeed({
      status: "failed",
      errorMessage: "Email send failed.",
    }),
  SesError: (sesError) =>
    Effect.succeed({
      status: "failed",
      errorMessage: `SES rejected email with status ${sesError.status}.`,
    }),
})
```

## Debugging Checklist

When an unrelated endpoint fails with a generic `500 HTTPError`:

1. Test a known missing route, such as `/api/does-not-exist`.
2. If that also returns `500`, suspect API layer construction, middleware, or routing setup.
3. Run `pnpm dev` or `alchemy dev --stage preview` locally and hit the same endpoint.
4. Look for layer construction errors, especially `InvalidConfigError`.
5. Check whether a globally provided service reads feature-specific config in `Layer.effect(...)`.
6. Move that config load into the specific method or endpoint that actually needs it.

## Good Verification

With email env vars missing, these responses are healthy:

```txt
/api/credits/balance -> 401 Unauthorized
/api/does-not-exist -> 404 Not Found
/api/auth/get-session -> 200 null
```

The anonymous balance request should return `401`, not `500`, because the API layer is alive and the request simply lacks a session.

For a signed-in user, `/api/credits/balance` should reach the credits handler. If the user has no credit account row yet, the store should lazily create one with `0` available credits.

## Final Principle

Do not let one feature's missing config become a global API startup failure. In Effect, where you place `Config` reads determines the blast radius of missing configuration.
