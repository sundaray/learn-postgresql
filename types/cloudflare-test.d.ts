/// <reference types="@cloudflare/vitest-pool-workers/types" />

// Declares the `cloudflare:test` module (env, applyD1Migrations, and the
// Durable Object helpers) for the workerd test runner. Tests are co-located
// under src/, so they are part of the same TypeScript project as the app and
// `tsc --noEmit` type-checks them alongside it.

export {}
