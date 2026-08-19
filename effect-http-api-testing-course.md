# Testing Effect HTTP APIs

**A complete course on comprehensively testing backends built with Effect v4's HTTP API — from pure unit tests with Test Layers to full-stack integration tests on Cloudflare Workers.**

---

## Course structure

Chapters marked **(parent)** are grouping chapters only — they have no page of their own. Every other chapter is a standalone page.

1. Introduction
2. Project overview
3. Project setup
4. Effect testing essentials **(parent)**
   - 4.1 From mocks to Test Layers
   - 4.2 `@effect/vitest`: your new test runner
   - 4.3 Testing the error channel
   - 4.4 Controlling time with TestClock
   - 4.5 Taming randomness and configuration
5. Designing a test strategy **(parent)**
   - 5.1 The testing pyramid for an Effect HTTP API
   - 5.2 Testable by design: getting I/O out of middleware
6. Unit testing services **(parent)**
   - 6.1 Business logic: LinkService against an in-memory store
   - 6.2 Time-dependent logic: testing session expiry
   - 6.3 Simulating failure: the race-condition test
7. Unit testing middleware **(parent)**
   - 7.1 Testing authentication: bearer tokens and fake requests
   - 7.2 Testing HMAC middleware: signatures and config
8. Endpoint tests with HttpApiTest
9. Integration testing on Cloudflare Workers **(parent)**
   - 9.1 Running tests inside workerd
   - 9.2 Testing I/O stores against real D1
   - 9.3 Full-stack integration tests
10. Gotchas and best practices **(parent)**
    - 10.1 Gotchas that will bite you
    - 10.2 A testing checklist for your own API
11. Where to go from here

---

# 1. Introduction

Most backend testing advice was written for a world of classes, dependency-injection containers and mocking frameworks. You stub out a repository with `jest.mock`, you monkey-patch `Date.now`, you spin up a database in Docker and pray your CI is fast enough. It works — sort of — but every test carries a quiet anxiety: _am I testing my code, or my mocks?_

Effect changes the economics of testing so thoroughly that most of that tooling simply disappears. There is no mocking framework in this course. There is no `vi.mock`, no `sinon`, no `Date.now` patching, no dependency-injection container. Instead there are **layers** — and a test layer is not a mock. It is a real, fully type-checked implementation of a real interface that happens to be backed by a `Map` instead of a database. The compiler holds it to the same contract as production code, which means an entire category of "my mock drifted out of sync with reality" bugs cannot exist.

This course teaches you to comprehensively test a backend built with **Effect v4's HTTP API** (`effect/unstable/httpapi`). By the end you will know how to:

- structure an Effect backend so it is _testable by design_ — including the one design flaw that makes middleware untestable, and how to fix it;
- write **unit tests** for services with in-memory test layers, deterministic IDs, and a controllable clock;
- test **time-dependent logic** (session expiry, TTLs) in microseconds using `TestClock`, without ever waiting;
- assert on **typed errors** precisely, using `Effect.exit` and `Effect.flip`;
- unit test **middleware** — authentication, authorization, and HMAC request signing — with fake requests and controlled configuration;
- test whole **endpoint groups in memory** with `HttpApiTest`, exercising routing, schema validation and middleware without a server;
- run **integration tests inside Cloudflare's `workerd` runtime** with `@cloudflare/vitest-pool-workers`, against a real D1 (SQLite) database, using your production layers unchanged;
- decide _what belongs at which level_ — which behaviors deserve a unit test, which need a real database, and which only an end-to-end request can prove.

## Who this course is for

You should be comfortable with TypeScript and have working familiarity with Effect: you know what `Effect.gen`, services (`Context.Service`), and `Layer` are, and you have seen `HttpApi` / `HttpApiGroup` / `HttpApiEndpoint` before. You do _not_ need any testing background beyond having seen a `describe`/`it` block.

We use **Effect v4 (beta)**, pinned to `4.0.0-beta.93`. Effect v4 lives in the [`effect-smol` repository](https://github.com/Effect-TS/effect-smol) and all ecosystem packages share a single version number — the pins matter, and the setup chapter covers them.

## How the course works

You will clone a small, production-shaped demo repository — **Shortly**, a URL-shortener API on Cloudflare Workers + D1 — and write every test in this course against it yourself. Each testing chapter follows the same rhythm:

1. **What are we testing, and why this piece?** Every chapter picks one representative target (one service, one middleware, one route group). The skills transfer; the repetition would not.
2. **Which cases matter?** We enumerate the behaviors worth paying for, and say why.
3. **Write the tests.** Complete, runnable code you type in and execute.
4. **Read the results, and the fine print.** Every chapter ends with the gotchas we hit for real while building this material.

One honest note before we start: a couple of things in this course were discovered _by the tests failing while the course was being written_ — a Drizzle error-wrapping change that silently broke error classification, and a storage-isolation subtlety in Cloudflare's test pool. We kept them in, because watching a test catch a real bug is the entire sales pitch of testing.

---

# 2. Project overview

Before writing a single test, you need to know the system under test. This chapter walks through **Shortly**, the demo backend, top to bottom. The complete source is in the companion repository (see chapter 3 for setup); here we cover the shape, the request lifecycle, and the design decisions that make the whole thing testable.

## What Shortly does

Shortly is a URL shortener with accounts, plans, and housekeeping:

| Method & path                        | Auth    | Behavior                                           |
| ------------------------------------ | ------- | -------------------------------------------------- |
| `POST /api/links`                    | session | Create a short link — optional custom slug and TTL |
| `GET /api/links`                     | session | List your links                                    |
| `GET /api/links/:slug`               | session | Fetch one of your links                            |
| `DELETE /api/links/:slug`            | session | Delete one of your links                           |
| `GET /r/:slug`                       | public  | 302 redirect to the target, counting the click     |
| `POST /api/admin/users/:userId/plan` | admin   | Change a user's plan (`free` ↔ `pro`)              |
| `POST /api/internal/purge`           | HMAC    | Machine-to-machine: delete expired links           |

Small — but look at what it contains. Plan limits and slug conflicts (business rules). Session and link expiry (time). Bearer-token auth and role checks (middleware). HMAC request signing (crypto + config). A unique constraint in the database that the application must translate into a domain error (the check-then-insert race). Schema-validated payloads. Even a non-JSON response (the redirect). Every one of these is a thing you will have to test in any real backend; Shortly has them all within thirty files.

## The three-layer anatomy

Every domain in Shortly (links, sessions, users) follows the same three-layer anatomy. Understanding it is understanding the test strategy, so let's be precise.

### Layer 1: the contract — endpoints

```ts
// src/links/endpoints.ts (excerpt)
export const CreateLinkPayload = Schema.Struct({
  url: Schema.String.check(Schema.isPattern(/^https?:\/\/.+/)),
  customSlug: Schema.NullOr(
    Schema.String.check(Schema.isPattern(/^[a-z0-9-]{4,32}$/)),
  ),
  ttlMs: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
});

export const createLinkEndpoint = HttpApiEndpoint.post("createLink", "/", {
  payload: CreateLinkPayload,
  success: LinkSchema.pipe(HttpApiSchema.status(201)),
  error: [SlugTaken, LimitExceeded],
}).middleware(AuthMiddleware);
```

An endpoint is _pure data_: a method, a path, schemas for payload/success/errors, and middleware requirements. No behavior. This purity is load-bearing for testing — because the API definition is data, Effect can derive from it both the server (`HttpApiBuilder`) _and_ a typed client (`HttpApiClient`), including the **in-memory test client** we'll meet in chapter 8.

Notice also what the schema is already doing for you: a request with a three-character custom slug never reaches your handler. It is rejected with a 400 by the schema layer. That is code you don't write and behavior you _still must test_ — at the integration level, where the schema actually runs.

### Layer 2: the logic — services

```ts
// src/links/service.ts (excerpt)
export class LinkService extends Context.Service<
  LinkService,
  {
    readonly create: (
      input: CreateLinkInput,
    ) => Effect.Effect<LinkRow, LimitExceeded | SlugTaken | ShortlyDbError>;
    // ...
  }
>()("shortly/LinkService") {}
```

`LinkService` owns the decisions: is this user at their plan limit? Is the slug taken? Is the link expired _right now_? It depends on `LinkStore` (I/O), `IdService` (randomness) and `Clock` (time) — and _only_ on those. Look at the error types in the signature: the possible failures of every operation are part of the interface. When we test this service, the compiler already told us exactly which sad paths exist.

### Layer 3: the plumbing — stores

```ts
// src/links/link-store.ts (excerpt)
export class LinkStore extends Context.Service<
  LinkStore,
  {
    readonly insert: (
      input: InsertLinkInput,
    ) => Effect.Effect<LinkRow, ShortlyDbError>;
    readonly findBySlug: (
      slug: string,
    ) => Effect.Effect<LinkRow | null, ShortlyDbError>;
    readonly deleteForUser: (
      userId: string,
      slug: string,
    ) => Effect.Effect<boolean, ShortlyDbError>;
    // ...
  }
>()("shortly/LinkStore") {}
```

Stores are deliberately _dumb_. `findBySlug` returns a row or `null` — it does not decide what a missing row means. `deleteForUser` bakes the ownership check into the SQL (`WHERE user_id = ? AND slug = ?`) so there is no read-then-delete race, and reports back only _whether_ it deleted. All failures are a single `ShortlyDbError`.

This dumbness is a gift to testing. A dumb interface is easy to reimplement in memory (chapter 6), and its real implementation is easy to verify against a real database (chapter 9.2), because there is no logic to duplicate on either side.

### The interface/implementation split

Every service and store comes as two files:

```
link-store.ts        <- the Context.Service tag + type. Imports nothing platform-specific.
link-store-live.ts   <- the Layer that talks to D1 through Drizzle.
```

And exactly **one** file in all of `src/` imports `cloudflare:workers`:

```ts
// src/db/db-live.ts — the only platform-specific file
import { env } from "cloudflare:workers";

export const DbServiceLive = Layer.sync(DbService, () =>
  DbService.of({ db: drizzle(env.DB, { schema }) }),
);
```

Platform bindings live at the very edge of the composition. The consequence: any test file can import any interface, any service implementation, any handler — in plain Node — without dragging in the Cloudflare runtime. Only tests that _want_ the real database run inside workerd. If you take one architectural rule from this course into your own codebase, take this one.

## Middleware, done the testable way

Shortly has three middleware:

```ts
// src/auth/middleware.ts
export class AuthMiddleware extends HttpApiMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentUser }
>()("shortly/AuthMiddleware", { error: Unauthorized }) {}

export class AdminMiddleware extends HttpApiMiddleware.Service<
  AdminMiddleware,
  { provides: CurrentUser }
>()("shortly/AdminMiddleware", { error: [Unauthorized, Forbidden] }) {}

export class InternalMiddleware extends HttpApiMiddleware.Service<InternalMiddleware>()(
  "shortly/InternalMiddleware",
  { error: Unauthorized },
) {}
```

The declarations state contracts: `AuthMiddleware` _provides_ `CurrentUser` to handlers downstream and may fail with `Unauthorized`. The implementations are where the testability battle is won or lost, and chapter 5.2 is entirely about that. The short version: **middleware must not talk to the database directly.** Shortly's auth middleware delegates every I/O decision to `SessionService`; the middleware itself is three lines of glue. You will see why this matters the moment you try to write a test.

There is one more subtlety worth noticing now. The session-expiry check inside `SessionService` reads the current time via Effect's `Clock`:

```ts
// src/auth/session.ts (excerpt)
const now = yield * Clock.currentTimeMillis;
if (row.expiresAt <= now) {
  return yield * Effect.fail(new SessionExpired({ expiredAt: row.expiresAt }));
}
```

Not `Date.now()`. `Clock.currentTimeMillis`. That one-line discipline is what will let us test session expiry by _moving time_ instead of waiting for it (chapter 6.2). Audit your own codebase for `Date.now()` inside business logic — each occurrence is a test you can't easily write.

## Errors: two kinds, two fates

Shortly distinguishes sharply between **domain errors** and **infrastructure failures**, and the distinction shapes every test you'll write:

- **Domain errors** — `SlugTaken`, `LimitExceeded`, `LinkNotFound`, `Unauthorized`... — are `Schema.TaggedErrorClass` values with an `httpApiStatus`. They are part of the API contract, serialized to clients as typed JSON bodies, and they flow through Effect's _typed error channel_.

```ts
export class SlugTaken extends Schema.TaggedErrorClass<SlugTaken>()(
  "SlugTaken",
  {
    message: withDefaultMessage("That slug is already in use."),
    slug: Schema.String,
  },
  { httpApiStatus: 409 },
) {}
```

- **Infrastructure failures** — `ShortlyDbError` — never cross the HTTP boundary. Handlers convert them to _defects_:

```ts
// src/links/endpoint-handlers.ts (excerpt)
return yield* linkService
  .create({ ... })
  .pipe(Effect.catchTag('ShortlyDbError', (dbError) => Effect.die(dbError)))
```

`Effect.die` says: this is not a failure the client can act on; it is a bug or an outage. HttpApi turns defects into opaque 500s. Your tests will assert on both fates — typed error bodies for domain errors (chapter 8, 9.3) and the _translation_ of database failures into domain errors where the service contract demands it (chapter 6.3).

## The request lifecycle

One request, end to end — keep this picture in mind for the whole course, because each chapter tests a different segment of it:

```
Request
  → HttpRouter route match            (tested in ch. 8 & 9.3)
  → middleware: AuthMiddleware        (unit: ch. 7.1 — through the pipeline: ch. 8, 9.3)
      → SessionService.lookup         (unit: ch. 6.2)
          → SessionStore.findByToken  (real D1: ch. 9.2 pattern)
  → payload schema decode             (through the pipeline: ch. 8, 9.3)
  → handler                           (ch. 8)
      → LinkService.create            (unit: ch. 6.1, 6.3)
          → LinkStore.insert          (real D1: ch. 9.2)
  → success/error schema encode       (ch. 8, 9.3)
Response
```

## Production wiring

Everything assembles in `src/layer.ts` — group handler layers on top, middleware and services in the middle, `DbService` at the base — and `src/worker.ts` turns it into a Cloudflare Worker:

```ts
// src/worker.ts
const appLayer = shortlyApiLayer.pipe(
  Layer.provide(NodeHttpServer.layerHttpServices),
);
const webHandler = HttpRouter.toWebHandler(appLayer);

export default {
  fetch: (request: Request) => webHandler.handler(request),
};
```

Every test in this course is a _slice_ of this exact graph with some layers swapped: in-memory stores for unit tests, fixed users for endpoint tests, the isolated test database for integration tests. That is the deepest idea in Effect testing, and it deserves its own sentence:

> **You never test different code. You test the same code, wired differently.**

---

# 3. Project setup

This chapter gets you from zero to a running test suite. Everything is pinned and verified; if you follow it exactly, `npm run test:unit` will be green at the end.

## Prerequisites

- **Node.js ≥ 22** (`node --version`)
- npm (bundled with Node) — or pnpm/bun if you prefer; commands below use npm
- A terminal and an editor with TypeScript support

You do **not** need a Cloudflare account. The Workers runtime used by the integration tests (`workerd`) is downloaded as an npm package and runs entirely locally.

## Step 1 — Clone the demo repository

```bash
git clone <YOUR-COURSE-REPO-URL> shortly
cd shortly
npm install
```

> If you prefer building the project from scratch, the complete file-by-file source is in the companion document `effect-http-api-test-demo-repo.md`. Create the files, then continue here.

## Step 2 — Understand the dependencies

Open `package.json`. Three groups matter.

**Runtime (exact-pinned):**

```json
"dependencies": {
  "@effect/platform-node": "4.0.0-beta.93",
  "drizzle-orm": "0.45.2",
  "effect": "4.0.0-beta.93"
}
```

Effect v4 is in beta and _all Effect ecosystem packages share one version number_, released in lockstep. `effect@4.0.0-beta.93` must pair with `@effect/platform-node@4.0.0-beta.93` and `@effect/vitest@4.0.0-beta.93`. Betas may include breaking changes between releases, so we pin exactly — no `^`. When you upgrade, upgrade all three together.

**Test stack:**

```json
"devDependencies": {
  "@cloudflare/vitest-pool-workers": "^0.18.0",
  "@cloudflare/workers-types": "^4.20250901.0",
  "@effect/vitest": "4.0.0-beta.93",
  "@types/node": "^25.0.0",
  "typescript": "^5.9.0",
  "vitest": "^4.1.0",
  "wrangler": "^4.0.0"
}
```

Two things to know:

- `@effect/vitest` is the Effect-aware layer over Vitest: it gives you `it.effect`, automatic `TestClock`, scoped resource cleanup, and readable fiber failure reports.
- `@cloudflare/vitest-pool-workers` **≥ 0.13 requires Vitest 4** and uses a Vite-plugin API (`cloudflareTest()`). Most older tutorials show the Vitest 3 API (`defineWorkersConfig`, `poolOptions.workers`) — that API is gone. This course uses the current one.

## Step 3 — The database story

Shortly uses **D1**, Cloudflare's SQLite database. For tests, you might expect us to tell you to install "some SQLite thing" — a local `better-sqlite3`, an in-memory shim. We don't, and the reason is worth internalizing:

> `@cloudflare/vitest-pool-workers` runs your tests **inside `workerd`** — the same runtime that executes your Worker in production — and gives every test file its **own real, isolated D1 database**, with your real migrations applied. There is nothing closer to the real world than the real thing.

So the answer to "what do I install for the database?" is: nothing extra. The test pool ships Miniflare, which ships D1 on real SQLite. Your store code runs against genuine SQLite semantics — `UNIQUE constraint failed` messages, `RETURNING` clauses, the lot.

The schema lives in plain SQL migrations:

```
migrations/
└── 0001_init.sql    # users, sessions, links (+ the UNIQUE slug constraint)
```

The test setup reads this exact directory and applies it to each test database — production schema and test schema cannot drift.

## Step 4 — The two test configs

Shortly deliberately splits testing into **two Vitest configs**, because the two halves want different runtimes.

**`vitest.config.ts` — unit tests, plain Node:**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
  },
});
```

**`vitest.workers.config.ts` — store + integration tests, inside workerd:**

```ts
import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(__dirname, "migrations"),
          ),
          INTERNAL_HMAC_SECRET: "test-internal-secret",
        },
      },
    })),
  ],
  test: {
    include: ["test/store/**/*.test.ts", "test/integration/**/*.test.ts"],
    setupFiles: ["./test/support/apply-migrations.ts"],
  },
});
```

Read it top to bottom: the `cloudflareTest()` plugin boots workerd with the bindings from your real `wrangler.jsonc`, plus two test-only bindings — the migration list and a known HMAC secret. The setup file applies migrations before each test file:

```ts
// test/support/apply-migrations.ts
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

Why two configs instead of one? Speed and honesty. Unit tests in Node start in under two seconds and rerun on save; you will run them hundreds of times a day. Workerd tests boot a real runtime and a real database; you run them before a push. Separating them keeps the fast loop fast — and makes it impossible to accidentally write a "unit test" that secretly depends on a database.

The scripts:

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "test": "npm run test:unit && npm run test:workers",
  "test:unit": "vitest run -c vitest.config.ts",
  "test:unit:watch": "vitest -c vitest.config.ts",
  "test:workers": "vitest run -c vitest.workers.config.ts",
  "test:workers:watch": "vitest -c vitest.workers.config.ts"
}
```

## Step 5 — Verify

```bash
npm run typecheck     # clean, zero errors
npm run test:unit     # all green — services, middleware, endpoint tests
npm run test:workers  # boots workerd; store + integration tests
```

> **If `test:workers` fails to boot** in your environment (some sandboxed CI containers block syscalls `workerd` needs): the tests are correct, your environment is the problem. Run them locally or in a standard CI runner (GitHub Actions' `ubuntu-latest` works fine).

## What you have now

A repository where:

- `npm run test:unit:watch` gives you sub-second feedback on all logic and middleware;
- `npm run test:workers` proves your SQL and your full request pipeline against the production runtime and database;
- the TypeScript compiler checks your _tests_ against the same interfaces as production code.

Time to learn the ideas that make it all click.

---

# 4. Effect testing essentials _(parent chapter — no page)_

_This chapter groups the five foundational ideas every later chapter builds on. If you already test Effect code daily, skim 4.1 and 4.3 anyway — they establish vocabulary the rest of the course uses._

---

## 4.1 From mocks to Test Layers

### The problem with mocks

In a conventional codebase, testing a service that talks to a database means intercepting the import:

```ts
// the old world — DO NOT do this in this course
vi.mock("../db/link-repository", () => ({
  findBySlug: vi.fn().mockResolvedValue(null),
  insert: vi
    .fn()
    .mockResolvedValue({ id: "link_1" /* ...hope this shape is right */ }),
}));
```

Three problems, in ascending order of severity:

1. **It's stringly-typed plumbing.** The mock is bound to a module path, not an interface. Move the file, the mock silently stops applying.
2. **The compiler doesn't check the mock.** `mockResolvedValue({ id: 'link_1' })` — is that the real return shape? If the interface gains a field next month, every mock is now wrong and every test still passes.
3. **It inverts the dependency discipline.** The production code imports its dependency directly, and the test _fights_ that hard-wiring with runtime patching. The design problem (hard-wired dependencies) is being masked, not fixed.

### The Effect answer

Effect code never hard-wires a dependency. It _declares_ one:

```ts
const create = (input: CreateLinkInput) =>
  Effect.gen(function* () {
    const store = yield* LinkStore; // "I need a LinkStore. I don't care which."
    // ...
  });
```

`LinkStore` here is a **tag** — a typed placeholder in the context. Production wires the D1 implementation in; a test wires something else in. Both are just layers:

```ts
// production
const live = LinkServiceLive.pipe(
  Layer.provide(LinkStoreLive),
  Layer.provide(DbServiceLive),
);

// test
const test = LinkServiceLive.pipe(Layer.provide(LinkStoreTest));
```

And here is the crucial line from Shortly's test support — read the types:

```ts
// test/support/test-layers.ts (excerpt)
export const LinkStoreTest = Layer.sync(LinkStore, () => {
  const linksBySlug = new Map<string, LinkRow>();

  return LinkStore.of({
    insert: (input) =>
      Effect.sync(() => {
        const row: LinkRow = { ...input, clicks: 0 };
        linksBySlug.set(input.slug, row);
        return row;
      }),
    findBySlug: (slug) => Effect.sync(() => linksBySlug.get(slug) ?? null),
    // ... every other method, fully implemented
  });
});
```

`LinkStore.of({...})` is type-checked against the _same interface_ as the production implementation. Forget a method — compile error. Return the wrong shape — compile error. Add a method to the interface next quarter — every test layer fails to compile until updated. **A test layer cannot drift.** That is the difference between a mock and a test layer, and it is not a small difference; it is the difference between tests you trust and tests you re-verify by hand when something breaks.

A few practical notes on writing test layers:

- **Mutable state inside the layer is fine.** JavaScript is single-threaded; a `Map` and a counter are perfectly safe, and far more readable than simulating immutability.
- **Fresh layer per test = perfect isolation.** Because the `Map` is created inside `Layer.sync`'s thunk, every time the layer is built you get an empty store. No `beforeEach` cleanup, ever.
- **Keep test layers honest but minimal.** `LinkStoreTest` implements filtering and counting because the service under test relies on those semantics. It does not simulate SQL errors — when a single test needs a failing store, we build a one-off stub _in that test_ (you'll see this in 6.3).

### Where do test layers live?

Shortly puts shared, reusable test layers in `test/support/test-layers.ts`. An equally good convention — used widely in the Effect ecosystem — is attaching them to the service class as a static:

```ts
class Users extends Context.Service<Users, {...}>()('app/Users') {
  static readonly layer = Layer.effect(Users, /* live */)
  static readonly testLayer = Layer.sync(Users, /* in-memory */)
}
```

Pick one convention and stay consistent. We use the separate-file style so the production `src/` tree contains no test code.

---

## 4.2 `@effect/vitest`: your new test runner

`@effect/vitest` wraps Vitest with Effect-awareness. Import everything from it — including `describe` and `expect` — so the whole test file speaks one dialect:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
```

### `it.effect` — the workhorse

```ts
it.effect('creates a link', () =>
  Effect.gen(function* () {
    const linkService = yield* LinkService
    const link = yield* linkService.create({ ... })
    expect(link.slug).toBe('slug-1')
  }).pipe(Effect.provide(testLayer)),
)
```

The test body _is an Effect_. `it.effect` runs it and:

- provides a **test environment** — most importantly a `TestClock` (time starts at 0 and only moves when you say so; see 4.4);
- manages a **Scope** — resources acquired with `acquireRelease` are released when the test ends, automatically;
- reports failures as **fiber dumps** — you see the full cause tree (failure vs defect, spans, logs), not a bare stack trace;
- **suppresses logs** by default, so test output stays readable (provide a logger, or use `it.live`, when you actually want them).

The pattern to internalize:

```ts
it.effect(
  "description",
  () =>
    Effect.gen(function* () {
      // Arrange — build/seed via services
      // Act — call the thing
      // Assert — plain vitest expect()
    }).pipe(Effect.provide(testLayer)), // wiring goes here, at the edge
);
```

Assertions are ordinary `expect()` calls — synchronous, inside the generator. Providing layers happens once, at the end of the pipe, keeping wiring visually separate from the test's story.

### The other runners

- **`it.live`** — runs with the _real_ environment: real clock, logs visible. Use it when you genuinely need wall-clock behavior (rare; mostly for debugging).
- **`it.scoped`** — explicit scope for resource-lifecycle tests. In v4, `it.effect` already closes its scope automatically, so you need this less than in v3.
- **`it.effect.skip` / `.only` / `.fails` / `.each`** — the usual Vitest modifiers, Effect-flavored. `.fails` is a nice way to document a known bug: the test _must_ fail to pass.
- **`layer(SomeLayer)('suite', (it) => ...)`** — share one built layer across many tests (memoized once). Worth knowing; in this course we provide layers per-test instead, because per-test layers give per-test isolation, and building an in-memory layer costs microseconds.

### One rule that will save you an afternoon

Every `yield*` inside the generator needs its requirements satisfied by the time the effect runs. If the compiler tells you

```
Type 'LinkStore' is not assignable to type 'never'
```

it means: _something in this test still requires `LinkStore` and you haven't provided it._ The error lives at the `it.effect` boundary, not where you wrote the `yield*`. Read Effect requirement errors from the outside in.

---

## 4.3 Testing the error channel

An Effect's type carries its failures: `Effect<LinkRow, LimitExceeded | SlugTaken | ShortlyDbError>`. Those errors are _values_, and your tests should assert on them as precisely as you assert on successes. Three tools cover every case.

### Tool 1: `Effect.exit` — capture either outcome

`Effect.exit` converts an effect into an `Exit` value — `Exit.succeed(a)` or `Exit.fail(e)` (or a defect) — without throwing:

```ts
it.effect("fails with LimitExceeded once the plan limit is reached", () =>
  Effect.gen(function* () {
    // ...arrange five existing links...
    const result = yield* Effect.exit(linkService.create(createInput));
    expect(result).toStrictEqual(Exit.fail(new LimitExceeded({ limit: 5 })));
  }).pipe(Effect.provide(testLayer)),
);
```

Read that assertion again: it checks _everything at once_ — that it failed (not succeeded), with `LimitExceeded` (not some other error), carrying `limit: 5` (the right payload). One line. This works because Effect's tagged errors are plain structured data with structural equality — `new LimitExceeded({ limit: 5 })` equals any other `LimitExceeded` with the same fields.

### Tool 2: `Effect.flip` — when you can't compare structurally

Some errors wrap live values you can't reconstruct — `ShortlyDbError` carries the actual driver exception. Comparing those with `toStrictEqual` is hopeless. `Effect.flip` swaps the channels: failure becomes success, so you can _inspect_ the error:

```ts
const error = yield * Effect.flip(store.insert({ ...baseLink, id: "link_2" }));
expect(error._tag).toBe("ShortlyDbError");
expect(isUniqueViolation(error.cause)).toBe(true);
```

(Bonus: if the effect unexpectedly _succeeds_, `flip` makes the test fail — exactly what you want.)

### Tool 3: `Effect.catchTag` in the code under test

Not a test tool, but the thing your tests verify: services _translate_ errors. `LinkService.create` catches the store's `ShortlyDbError`, checks whether it is a unique violation, and re-fails with the domain error `SlugTaken`. Chapter 6.3 tests exactly that translation.

### Failures are not defects — test both fates

This distinction runs through the whole course, so let's fix it now:

|              | Failure                        | Defect                             |
| ------------ | ------------------------------ | ---------------------------------- |
| Created by   | `Effect.fail(e)`               | `Effect.die(e)`, thrown exceptions |
| In the type  | ✅ in the error channel        | ❌ invisible                       |
| HTTP result  | typed response (409, 429, ...) | opaque 500                         |
| Testing tool | `Effect.exit` / `Effect.flip`  | integration test asserting 500     |

Shortly's handlers demote `ShortlyDbError` to a defect (`Effect.die`) because a broken database is not a client-actionable condition. The result: the endpoint's _contract_ stays small and honest, and your integration tests can verify that infrastructure failures produce 500s rather than leaking `{"_tag":"ShortlyDbError", cause: ...}` to the world.

### A note on `toStrictEqual` with tagged errors

`Exit.fail(new SessionNotFound())` compared with `toStrictEqual` works because both sides are instances of the same class with the same own-properties. If you ever hit false negatives comparing Effect data types (e.g. `Option`, `Chunk`) under plain Vitest equality, `@effect/vitest` exports `addEqualityTesters()` — call it once in a setup file to teach Vitest Effect's `Equal` semantics. For the tagged errors in this course, the plain comparison is sufficient and we use it as-is.

---

## 4.4 Controlling time with TestClock

Time-dependent code is where conventional test suites go to die. Either the suite `await sleep(60_000)`s (unacceptably slow), or it stubs `Date.now` globally (fragile, leaks across tests), or the behavior just doesn't get tested.

Effect solves this at the root. Code never reads the system clock directly — it reads the **`Clock` service**:

```ts
const now = yield * Clock.currentTimeMillis;
```

Under `it.effect`, the environment contains a **TestClock**: time starts at `0` and _only advances when the test says so_.

```ts
import { TestClock } from "effect/testing"; // note: the v4 import path

it.effect("fails with LinkExpired once the TestClock passes expiresAt", () =>
  Effect.gen(function* () {
    const linkService = yield* LinkService;
    yield* linkService.create({
      ...createInput,
      customSlug: "moment",
      ttlMs: 60_000,
    });

    // Still fine one millisecond before expiry...
    yield* TestClock.adjust(59_999);
    expect(yield* linkService.resolve("moment")).toBe("https://effect.website");

    // ...but expired exactly at the deadline.
    yield* TestClock.adjust(1);
    const result = yield* Effect.exit(linkService.resolve("moment"));
    expect(result).toStrictEqual(Exit.fail(new LinkExpired()));
  }).pipe(Effect.provide(testLayer)),
);
```

Look at what this test does that a conventional suite _cannot reasonably do_: it verifies the **boundary condition** — valid at `59,999ms`, expired at exactly `60,000ms`. That off-by-one (`<` vs `<=`) is precisely the kind of bug that ships to production because nobody wanted to write the sleep-based test. Here, it costs two lines and runs in microseconds.

The API surface you need:

- `TestClock.adjust(duration)` — advance time by a duration (`5000`, or `"5 seconds"`). Any timers due in that window fire.
- `TestClock.setTime(millis)` — jump to an absolute time. Useful for making timestamps meaningful: `yield* TestClock.setTime(1_000)` and now `createdAt` should be exactly `1_000`.

And the discipline it demands of production code — worth repeating from chapter 2:

> Every `Date.now()` in business logic is a test you can't write. Use `Clock.currentTimeMillis`.

One caveat that trips people up (it appears again in chapter 10): TestClock controls _Effect's_ notion of time — `Clock`, `Effect.sleep`, `Effect.timeout`, schedules. It does **not** reach inside `Effect.tryPromise(() => somePromise)` — a real promise's `setTimeout` runs on the real timer. If a test seems to hang after `TestClock.adjust`, you almost certainly have real async hiding inside a promise where Effect can't see it.

---

## 4.5 Taming randomness and configuration

Time was the big one, but two other sources of nondeterminism remain in any real backend: random values and environment configuration. The treatment is identical: _make it a dependency, then control the dependency_.

### Randomness: `IdService`

Shortly never calls `crypto.randomUUID()` inline. It has a service:

```ts
// src/shared/ids.ts
export class IdService extends Context.Service<
  IdService,
  {
    readonly make: (prefix: IdPrefix) => Effect.Effect<string>;
    readonly slug: Effect.Effect<string>;
  }
>()("shortly/IdService") {}
```

And the test layer makes it deterministic — sequential, assertable values:

```ts
// test/support/test-layers.ts
export const IdServiceTest = Layer.sync(IdService, () => {
  let counter = 0;
  return IdService.of({
    make: (prefix) => Effect.sync(() => `${prefix}_${++counter}`),
    slug: Effect.sync(() => `slug-${++counter}`),
  });
});
```

Now a test can assert `expect(link.slug).toBe('slug-1')` — an _exact_ value, not a regex against random noise. When a test can predict exact outputs, its failures are exact too.

### Configuration: `ConfigProvider`

Shortly's internal middleware reads its HMAC secret through Effect's `Config`:

```ts
const secret = yield * requiredSecret("INTERNAL_HMAC_SECRET");
```

In production, config resolves from the environment. In tests, you _replace the provider_ with an in-memory one — no `process.env` mutation, no `vi.stubEnv`, no cleanup:

```ts
import { ConfigProvider } from "effect";

const testConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ INTERNAL_HMAC_SECRET: "test-secret" }),
);

// ...
somethingThatReadsConfig.pipe(Effect.provide(testConfig));
```

And — the underrated half — you can test the _missing-config_ path just as easily:

```ts
Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})));
// -> the middleware should fail Unauthorized, not crash
```

Chapter 7.2 uses both. The pattern generalizes: anything your code reads from the outside world — time, randomness, environment, the database — becomes controllable in tests the moment it flows through a service or provider instead of a global.

---

# 5. Designing a test strategy _(parent chapter — no page)_

_Before writing more tests, decide what kinds of tests to write. This grouping chapter's two pages carry the course's key architectural decisions: 5.1 assigns every behavior to a level of the pyramid; 5.2 fixes the one design flaw that would make chapter 7 impossible._

---

## 5.1 The testing pyramid for an Effect HTTP API

"Write unit tests for logic, integration tests for wiring" is good advice rendered useless by vagueness. Let's make it concrete for an Effect HTTP API backend. Shortly's suite has four levels; here is each one, with its job, its cost, and its blind spots.

### Level 1 — Unit tests for services (Node, in-memory layers)

**Verify:** business decisions. Plan limits, slug conflicts, expiry logic, error translation, anti-enumeration policy.
**Wiring:** service live layer + in-memory stores + deterministic IDs + TestClock.
**Cost:** ~milliseconds per test. Run in watch mode, always.
**Blind spot:** whether your SQL actually does what the in-memory store pretends it does.

### Level 2 — Unit tests for middleware (Node, fake requests)

**Verify:** the request-derived decisions. Token extraction, session validation, role checks, signature verification, missing-config behavior.
**Wiring:** the middleware's underlying effect + `HttpServerRequest.fromWeb(new Request(...))` + stub session/config layers.
**Cost:** milliseconds.
**Blind spot:** whether the middleware is actually _attached_ to the endpoints it should protect.

### Level 3 — Endpoint tests with `HttpApiTest` (Node, in-memory client)

**Verify:** the HTTP pipeline _around_ your handlers — routing, payload decoding, success/error schema round-trips, middleware application — without a server or database.
**Wiring:** real group handler layer + test-double middleware + in-memory stores, driven by a generated typed client.
**Cost:** tens of milliseconds.
**Blind spot:** platform behavior — the real runtime, the real database, real config resolution.

### Level 4 — Integration tests (workerd, real D1)

**Verify:** the whole thing. Real worker entry, real middleware, real SQL against real SQLite, real schema validation, real status codes and bodies. Plus the store tests: your SQL's semantics, verified directly.
**Wiring:** production layers, unchanged. The test database is isolated per file and migrated from your real migrations.
**Cost:** seconds of startup, then fast. Run before push and in CI.
**Blind spot:** production data shapes, scale, concurrency under load — no test suite covers everything.

### The assignment rule

Here is the rule this course applies relentlessly, and the one to steal for your own API:

> **Test every behavior at the _lowest_ level that can actually falsify it — and at exactly one level, except for the contract itself.**

Applied to Shortly:

| Behavior                                            | Level                             | Why                                                 |
| --------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| Plan limit enforcement                              | 1                                 | pure decision over a count                          |
| Expiry boundary (`<=` vs `<`)                       | 1                                 | needs TestClock precision                           |
| Unique-violation → `SlugTaken` translation          | 1 (stub) **and** 4 (real)         | logic at L1; the real error shape at L4             |
| Bearer parsing, expired-session rejection           | 2                                 | request-derived, no HTTP pipeline needed            |
| HMAC verification incl. missing config              | 2                                 | crypto + config, no pipeline needed                 |
| Payload validation (400s)                           | 3 or 4                            | the schema runs _in the pipeline_, not in your code |
| `SlugTaken` serializes as 409 + typed body          | 3 (typed client) and 4 (raw JSON) | the contract — the one thing worth double-covering  |
| Auth actually attached to routes                    | 4                                 | only an unauthenticated request proves it           |
| SQL semantics (`RETURNING`, unique, expiry deletes) | 4 (store tests)                   | only the real database can falsify SQL              |

Two deliberate consequences of the rule. First, there are no "unit tests" that secretly need a database — if it needs SQL to be meaningful, it _is_ a store or integration test, and lives in the workerd config. Second, almost nothing is tested twice. Double coverage feels virtuous and costs you every time the behavior legitimately changes: three levels of tests to update instead of one. The exception is the API contract itself (status codes, error bodies), which is important enough to prove both through the typed client and as raw HTTP.

### What we deliberately do not test

- **Framework internals.** HttpApi's router works; Effect's test suite covers it. We test _our_ routes, not routing.
- **Store implementations against in-memory fakes.** A store test that mocks the database tests nothing. Stores are tested against real D1 or not at all.
- **Every endpoint uniformly.** The course tests one of each _kind_ thoroughly. In your own API, coverage breadth matters — but depth-per-kind is what this course teaches.

---

## 5.2 Testable by design: getting I/O out of middleware

This page is about a single design flaw — one that exists in a great many production Effect codebases, one the course author has made, and one that will make chapter 7 either trivial or impossible depending on whether you fix it. If you take design guidance from only one page of this course, make it this one.

### The flaw

Here is an auth middleware written the way most of us write it the first time. It talks to the auth library (and through it, the database) _directly inside the middleware body_:

```ts
// ❌ the flawed version — middleware doing its own I/O
const currentUserFromRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const session = yield* Effect.tryPromise({
    try: () =>
      auth().api.getSession({ headers: requestHeaders(request.headers) }),
    catch: () => new Unauthorized(),
  });

  if (!session?.user) {
    return yield* Effect.fail(new Unauthorized());
  }
  return CurrentUser.of({ userId: session.user.id /* ... */ });
});

export const AuthMiddlewareLive = Layer.succeed(AuthMiddleware, (effect) =>
  Effect.provideServiceEffect(effect, CurrentUser, currentUserFromRequest),
);
```

It works in production. Now try to unit test it. The middleware's dependency on the database is a **direct function call** — `auth().api.getSession` — an import, not a service. There is no tag to provide a test layer for. Your options are all bad: spin up a database for a middleware test (slow, and now it's not a unit test), or `vi.mock` the auth module (all the mock problems from 4.1), or don't test it (what usually happens).

The root cause, named precisely: **the middleware body performs I/O that isn't represented in Effect's dependency system.** Effect can only swap what flows through the context. Anything reached by direct import is hard-wired.

### The fix: extract the I/O into a service

Give the I/O a tag. In Shortly, session lookup is a proper service pair — `SessionStore` (dumb I/O: token → row or null) and `SessionService` (logic: expiry, mapped errors):

```ts
// src/auth/session.ts (excerpt)
export class SessionService extends Context.Service<
  SessionService,
  {
    readonly lookup: (
      token: string,
    ) => Effect.Effect<
      SessionUser,
      SessionNotFound | SessionExpired | ShortlyDbError
    >;
  }
>()("shortly/SessionService") {}
```

And the middleware shrinks to _glue_:

```ts
// ✅ src/auth/middleware-live.ts — the testable version
export const currentUserFromRequest = (sessions: SessionService["Service"]) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;

    const token = bearerToken(request.headers);
    if (token === null) return yield* Effect.fail(new Unauthorized());

    const user = yield* sessions.lookup(token).pipe(
      Effect.catchTags({
        SessionNotFound: () => Effect.fail(new Unauthorized()),
        SessionExpired: () => Effect.fail(new Unauthorized()),
        ShortlyDbError: (dbError) => Effect.die(dbError),
      }),
    );

    return CurrentUser.of(user);
  });

export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const sessions = yield* SessionService; // dependency, by tag
    return (effect) =>
      Effect.provideServiceEffect(
        effect,
        CurrentUser,
        currentUserFromRequest(sessions),
      );
  }),
);
```

Study the differences; each is doing testing work:

1. **`Layer.effect` instead of `Layer.succeed`.** The middleware layer now _yields_ `SessionService` while being built. The dependency is in the layer graph — visible in types, swappable in tests, resolved once (not per request).
2. **The logic is an exported, standalone effect.** `currentUserFromRequest` can be tested _directly_: give it a stub `SessionService` and a fake request, assert on the result. No HTTP pipeline required. The middleware wrapper around it is a one-liner that integration tests cover for free.
3. **Error handling is explicit and total.** `catchTags` handles every failure the session service can produce, and the compiler enforces totality: add a new error to `SessionService.lookup`'s signature and this middleware _stops compiling_ until you decide what it means for authentication. Note the asymmetry — missing/expired sessions become `Unauthorized` (a client problem), while `ShortlyDbError` becomes a defect (our problem, 500). That is exactly the failure/defect discipline from 4.3, applied where it matters most.

### The payoff, concretely

With the flawed version, "test that expired sessions are rejected" required a database with an expired row in it. With the fixed version (chapter 7.1), it is:

```ts
const sessions = sessionStoreFromRows([
  { token: "token-user", expiresAt: 5 /* ... */ },
]);
// TestClock at 10 -> lookup fails SessionExpired -> middleware fails Unauthorized
```

Same code path production runs. Zero databases. Sub-millisecond.

### The general principle

Middleware is just the most common offender. The rule is:

> **Every effect that touches the outside world must reach it through a tag.** If you can't name the service a piece of code uses to do I/O, you can't test that code in isolation.

Run this audit on your own backend: `grep` your middleware and services for direct imports of database clients, auth libraries, HTTP SDKs, `fetch`. Each hit is a place where a test layer cannot reach — and, in six months, an untested code path with your authentication logic in it.

_(If your production code has this flaw today: the refactor is mechanical, exactly the extraction shown above, and it changes no behavior. Do it before writing the chapter 7 tests against your own code.)_

---

# 6. Unit testing services _(parent chapter — no page)_

_Level 1 of the pyramid, hands-on. We test Shortly's two services — `LinkService` for pure business rules and race-condition translation, `SessionService` for time-dependent logic. Create the files as you go and keep `npm run test:unit:watch` running._

---

## 6.1 Business logic: LinkService against an in-memory store

### Why this target

`LinkService.create` is the busiest decision-maker in the codebase: it enforces plan limits, resolves slugs (custom vs generated), guards against conflicts, computes timestamps and expiry. Its signature announces three distinct failures:

```ts
create: (input: CreateLinkInput) =>
  Effect.Effect<LinkRow, LimitExceeded | SlugTaken | ShortlyDbError>;
```

Each named error is a sad path you must cover; the type system just handed you the test plan.

### The test cases, and why

1. **Creates a link with generated slug and Clock timestamp** — the happy path, plus proof that IDs come from `IdService` and time from `Clock` (exact-value assertions).
2. **Uses the custom slug when provided** — the branch.
3. **Fails `LimitExceeded` at the plan limit** — the business rule with money attached.
4. **Fails `SlugTaken` when the custom slug exists** — the optimistic check.
5. **Translates a unique-violation race into `SlugTaken`** — deferred to 6.3; it deserves its own page.
6. **`resolve` returns the URL and counts the click** — a side effect worth pinning.
7. **`resolve` fails `LinkExpired` when time passes** — deferred to the TestClock discussion below.
8. **`getForUser` hides other users' links as `LinkNotFound`** — a security property. These are the tests you want a reviewer to see failing when someone "simplifies" the ownership check.

### The wiring

Create `test/unit/link-service.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { TestClock } from "effect/testing";

import {
  LimitExceeded,
  LinkExpired,
  LinkNotFound,
  SlugTaken,
} from "../../src/links/errors";
import { LinkStore } from "../../src/links/link-store";
import { LinkService, LinkServiceLive } from "../../src/links/service";
import { IdServiceTest, LinkStoreTest } from "../support/test-layers";

// LinkServiceLive with in-memory infrastructure. provideMerge keeps
// LinkStore visible to the test itself, so tests can arrange and assert
// through the store directly.
const testLayer = LinkServiceLive.pipe(
  Layer.provideMerge(LinkStoreTest),
  Layer.provideMerge(IdServiceTest),
);

const createInput = {
  userId: "user-1",
  plan: "free",
  targetUrl: "https://effect.website",
  customSlug: null,
  ttlMs: null,
};
```

Two details worth a pause:

- **`Layer.provideMerge`, not `Layer.provide`.** Plain `provide` feeds `LinkStoreTest` into `LinkServiceLive` and then _hides_ it — the test could no longer reach the store. `provideMerge` feeds it in **and** keeps it exposed, so tests can look inside the store to assert side effects (we do exactly that for click counting). This distinction — provide = wire and hide, provideMerge = wire and expose — is one you'll use in every test file.
- **A shared `createInput` fixture** with per-test overrides via spread keeps each test's _intent_ visible: the test about limits only mentions limits.

### The tests

```ts
describe("LinkService.create", () => {
  it.effect(
    "creates a link with a generated slug and Clock-based timestamp",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(1_000);
        const linkService = yield* LinkService;

        const link = yield* linkService.create({
          ...createInput,
          ttlMs: 60_000,
        });

        expect(link.slug).toBe("slug-1");
        expect(link.createdAt).toBe(1_000);
        expect(link.expiresAt).toBe(61_000);
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("uses the custom slug when one is provided", () =>
    Effect.gen(function* () {
      const linkService = yield* LinkService;
      const link = yield* linkService.create({
        ...createInput,
        customSlug: "my-brand",
      });
      expect(link.slug).toBe("my-brand");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("fails with LimitExceeded once the plan limit is reached", () =>
    Effect.gen(function* () {
      const linkService = yield* LinkService;

      // Arrange: a free user already has 5 links.
      yield* Effect.forEach(["a", "b", "c", "d", "e"], (letter) =>
        linkService.create({ ...createInput, customSlug: `link-${letter}` }),
      );

      // Act & Assert
      const result = yield* Effect.exit(linkService.create(createInput));
      expect(result).toStrictEqual(Exit.fail(new LimitExceeded({ limit: 5 })));
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("fails with SlugTaken when the custom slug already exists", () =>
    Effect.gen(function* () {
      const linkService = yield* LinkService;
      yield* linkService.create({ ...createInput, customSlug: "take-this" });

      const result = yield* Effect.exit(
        linkService.create({
          ...createInput,
          userId: "user-2",
          customSlug: "take-this",
        }),
      );
      expect(result).toStrictEqual(
        Exit.fail(new SlugTaken({ slug: "take-this" })),
      );
    }).pipe(Effect.provide(testLayer)),
  );
});
```

Run it. Green, in a couple of milliseconds each. Now the behavioral pair for `resolve`:

```ts
describe("LinkService.resolve", () => {
  it.effect("returns the target url and increments clicks", () =>
    Effect.gen(function* () {
      const linkService = yield* LinkService;
      const linkStore = yield* LinkStore; // <- possible thanks to provideMerge
      yield* linkService.create({ ...createInput, customSlug: "hits" });

      const url = yield* linkService.resolve("hits");

      expect(url).toBe("https://effect.website");
      const stored = yield* linkStore.findBySlug("hits");
      expect(stored?.clicks).toBe(1);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("fails with LinkExpired once the TestClock passes expiresAt", () =>
    Effect.gen(function* () {
      const linkService = yield* LinkService;
      yield* linkService.create({
        ...createInput,
        customSlug: "moment",
        ttlMs: 60_000,
      });

      // Still fine one millisecond before expiry...
      yield* TestClock.adjust(59_999);
      expect(yield* linkService.resolve("moment")).toBe(
        "https://effect.website",
      );

      // ...but expired exactly at the deadline.
      yield* TestClock.adjust(1);
      const result = yield* Effect.exit(linkService.resolve("moment"));
      expect(result).toStrictEqual(Exit.fail(new LinkExpired()));
    }).pipe(Effect.provide(testLayer)),
  );
});

describe("LinkService.getForUser", () => {
  it.effect("reports someone else's link as LinkNotFound", () =>
    Effect.gen(function* () {
      const linkService = yield* LinkService;
      yield* linkService.create({ ...createInput, customSlug: "private" });

      const result = yield* Effect.exit(
        linkService.getForUser("user-2", "private"),
      );
      expect(result).toStrictEqual(Exit.fail(new LinkNotFound()));
    }).pipe(Effect.provide(testLayer)),
  );
});

describe("LinkService.purgeExpired", () => {
  it.effect("removes only links that are expired according to the Clock", () =>
    Effect.gen(function* () {
      const linkService = yield* LinkService;
      yield* linkService.create({
        ...createInput,
        customSlug: "temporary",
        ttlMs: 1_000,
      });
      yield* linkService.create({ ...createInput, customSlug: "permanent" });

      yield* TestClock.adjust(2_000);
      const purged = yield* linkService.purgeExpired;

      expect(purged).toBe(1);
      expect(yield* linkService.listForUser("user-1")).toHaveLength(1);
    }).pipe(Effect.provide(testLayer)),
  );
});
```

### What to notice

- **Arrange through the front door where possible.** The limit test creates its five links _through the service_, not by poking the store — so the arrangement itself exercises real code, and can't construct impossible states. Reach for the store directly only to observe (clicks) or to build states the service can't produce.
- **The expiry test proves the boundary.** `59,999` fine, `60,000` expired. We know Shortly uses `<=`; the test _pins_ it. When someone changes it to `<` next year, this test — not a customer — tells them what they changed.
- **Every isolation concern is absent.** No `beforeEach`, no cleanup, no shared state: each `Effect.provide(testLayer)` builds a fresh Map-backed store. Isolation by construction beats isolation by discipline.

---

## 6.2 Time-dependent logic: testing session expiry

### Why this target

`SessionService` is small, but it is the _gatekeeper_ — every authenticated request crosses it — and it is pure time-logic over a dumb store, which makes it the perfect standalone demonstration of TestClock testing. It is also the service the middleware chapter builds on: proving `lookup` correct here means chapter 7 can treat it as a solved problem.

The signature again dictates the plan:

```ts
lookup: (token: string) =>
  Effect.Effect<SessionUser, SessionNotFound | SessionExpired | ShortlyDbError>;
```

Three cases: found-and-valid, not found, found-but-expired.

### The store test layer

`SessionStore` is read-only from the service's perspective, so the cleanest test layer is a factory taking fixture rows — build the world, then run:

```ts
// test/support/test-layers.ts (excerpt)
export const sessionStoreFromRows = (rows: ReadonlyArray<SessionRow>) =>
  Layer.sync(SessionStore, () => {
    const byToken = new Map(rows.map((row) => [row.token, row]));
    return SessionStore.of({
      findByToken: (token) => Effect.sync(() => byToken.get(token) ?? null),
    });
  });
```

This factory-of-layers pattern — parameterize the layer on fixtures — is the test-data-builder pattern of the Effect world. You'll reuse it constantly.

### The tests

Create `test/unit/session-service.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { TestClock } from "effect/testing";

import {
  SessionExpired,
  SessionNotFound,
  SessionService,
  SessionServiceLive,
} from "../../src/auth/session";
import { sessionStoreFromRows } from "../support/test-layers";

const aliceSession = {
  token: "token-alice",
  userId: "user-alice",
  expiresAt: 5_000,
  email: "alice@example.com",
  role: "user",
  plan: "free",
};

const testLayer = SessionServiceLive.pipe(
  Layer.provide(sessionStoreFromRows([aliceSession])),
);

describe("SessionService.lookup", () => {
  it.effect("returns the session user for a valid token", () =>
    Effect.gen(function* () {
      const sessions = yield* SessionService;
      const user = yield* sessions.lookup("token-alice");

      expect(user).toStrictEqual({
        userId: "user-alice",
        email: "alice@example.com",
        role: "user",
        plan: "free",
      });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("fails with SessionNotFound for an unknown token", () =>
    Effect.gen(function* () {
      const sessions = yield* SessionService;
      const result = yield* Effect.exit(sessions.lookup("token-bogus"));
      expect(result).toStrictEqual(Exit.fail(new SessionNotFound()));
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("fails with SessionExpired once the clock passes expiresAt", () =>
    Effect.gen(function* () {
      const sessions = yield* SessionService;

      // The TestClock starts at 0, so the session is still valid.
      expect((yield* sessions.lookup("token-alice")).userId).toBe("user-alice");

      // Advance time past the expiry timestamp: no waiting, no Date mocking.
      yield* TestClock.setTime(5_000);
      const result = yield* Effect.exit(sessions.lookup("token-alice"));
      expect(result).toStrictEqual(
        Exit.fail(new SessionExpired({ expiredAt: 5_000 })),
      );
    }).pipe(Effect.provide(testLayer)),
  );
});
```

### What to notice

- **The third test is one scenario, two moments.** Same session, same store — only time moved. This reads like the requirement it verifies: "a session is valid until its expiry instant, and invalid from it." Try expressing that in one test _without_ a controllable clock.
- **The full user object is asserted with `toStrictEqual`**, not `user.userId` alone. `lookup` builds the `SessionUser` by hand from the row; a field-mapping typo (`role: row.plan`) is exactly the bug a whole-object assertion catches and a single-field one misses.
- **`SessionExpired` carries `expiredAt`** and the Exit assertion covers it. Rich errors are only worth their weight if something asserts on the payload; otherwise they decay into unverified decoration.
- Notice what is _missing_: no test for `ShortlyDbError` here. The service passes it through untouched — there is no logic to falsify, so there is no test. (The middleware's _handling_ of it is tested in chapter 7; the store's _production_ of it in chapter 9.2. Every level tests its own decisions.)

---

## 6.3 Simulating failure: the race-condition test

### The scenario

`LinkService.create` checks slug availability before inserting:

```ts
const existing = yield* store.findBySlug(input.customSlug)
if (existing !== null) return yield* Effect.fail(new SlugTaken({ slug: input.customSlug }))
// ...
return yield* store.insert({ ... })
```

Check-then-insert. Between the check and the insert, another request can claim the slug. The database's `UNIQUE` constraint will reject our insert — with a `ShortlyDbError`, not a `SlugTaken`. Untreated, the user who lost an innocent race gets a 500. So the service translates:

```ts
.pipe(
  Effect.catchTag(
    'ShortlyDbError',
    (dbError): Effect.Effect<never, SlugTaken | ShortlyDbError> =>
      isUniqueViolation(dbError.cause)
        ? Effect.fail(new SlugTaken({ slug }))
        : Effect.fail(dbError),
  ),
)
```

How do you test a race? You don't — not by racing. Reproducing the interleaving with real concurrency is flaky by definition. Instead, notice what the service actually _sees_ during the race: `findBySlug` said `null`, then `insert` failed with a unique violation. That pair of observations **is** the race, from the code's point of view. So we build a store that produces exactly that pair:

```ts
it.effect("translates a unique-constraint race into SlugTaken", () =>
  Effect.gen(function* () {
    const linkService = yield* LinkService;

    const result = yield* Effect.exit(
      linkService.create({ ...createInput, customSlug: "raced" }),
    );
    expect(result).toStrictEqual(Exit.fail(new SlugTaken({ slug: "raced" })));
  }).pipe(
    // A one-off stub: findBySlug sees nothing, but insert loses the race.
    Effect.provide(
      LinkServiceLive.pipe(
        Layer.provide(IdServiceTest),
        Layer.provide(
          Layer.sync(LinkStore, () => {
            const raceLoss = new ShortlyDbError({
              cause: new Error("UNIQUE constraint failed: links.slug"),
            });
            return LinkStore.of({
              insert: () => Effect.fail(raceLoss),
              findBySlug: () => Effect.succeed(null),
              listByUser: () => Effect.succeed([]),
              countByUser: () => Effect.succeed(0),
              incrementClicks: () => Effect.void,
              deleteForUser: () => Effect.succeed(false),
              deleteExpired: () => Effect.succeed(0),
            });
          }),
        ),
      ),
    ),
  ),
);
```

### What to notice

- **The stub is inline and disposable.** The shared `LinkStoreTest` stays honest and simple; this test needs a _liar_ — `findBySlug: null` but `insert: boom` — so it builds one, locally, where the lie is visible next to the test that needs it. Resist the urge to add failure-injection switches to your shared test layers; per-test stubs keep each deception scoped to its purpose.
- **It is still fully type-checked.** Even a one-off stub must implement the complete `LinkStore` interface. Tedious? Slightly. But when `LinkStore` gains a method, _this test breaks at compile time too_ — which is exactly what you want from a test that encodes assumptions about the store.
- **The error message matters — and here is the war story.** While this course was being written, this exact test failed unexpectedly: `isUniqueViolation` originally checked only the top-level `error.message`, but Drizzle (0.45) wraps driver errors in a `DrizzleQueryError` whose message is `Failed query: ...` — the `UNIQUE constraint failed` text lives on the _cause_ one level down. The fix walks the chain:

```ts
// src/shared/errors.ts
export function isUniqueViolation(cause: unknown): boolean {
  let current: unknown = cause;
  while (current !== null && current !== undefined) {
    const message =
      current instanceof Error ? current.message : String(current);
    if (message.includes("UNIQUE constraint failed")) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
```

Sit with what happened there: string-matching on error messages is a contract with a library that the library never signed. The unit test (with its hand-written error) _and_ the store test against real D1 (chapter 9.2, with the genuine error) together are what keep that contract honest — the unit test pins your logic, the store test pins their message. If either had existed alone, the Drizzle upgrade would have silently turned every lost race back into a 500.

---

# 7. Unit testing middleware _(parent chapter — no page)_

_Level 2. Thanks to the 5.2 refactor, middleware logic is just effects — so we test it like effects: fake request in, decision out. No server, no database, no pipeline._

---

## 7.1 Testing authentication: bearer tokens and fake requests

### What exactly are we testing?

After 5.2, the auth middleware consists of a one-line wrapper and an exported logic effect:

```ts
export const currentUserFromRequest = (sessions: SessionService["Service"]) =>
  Effect.gen(function* () {
    /* read header -> lookup -> map errors -> CurrentUser */
  });
```

We test **the exported effect**, not the wrapper. This is a deliberate seam: the wrapper's only job (installing the result as `CurrentUser` inside HttpApi's machinery) is proven by every endpoint and integration test in chapters 8 and 9. What needs _unit_ precision is the decision table:

| Request                         | Expected                                |
| ------------------------------- | --------------------------------------- |
| valid `Bearer` token            | `CurrentUser` with the session's fields |
| no `Authorization` header       | `Unauthorized`                          |
| header without `Bearer ` prefix | `Unauthorized`                          |
| unknown token                   | `Unauthorized`                          |

_(Why not test the wrapper directly? You can — the middleware service is just a function you can `yield_`and apply — but its type signature deals in`HttpServerResponse` effects and router-provided services, which adds type ceremony without adding falsification power. Test the seam you designed for testing.)\*

### The trick: a fake `HttpServerRequest`

The logic reads the current request from context (`yield* HttpServerRequest.HttpServerRequest`). In production, the server provides it. In a test, _you_ provide it — built from a plain web `Request`:

```ts
const withRequest = (headers: Record<string, string>) => {
  const request = HttpServerRequest.fromWeb(
    new Request("http://localhost/api/links", { headers }),
  );
  return Effect.provideService(HttpServerRequest.HttpServerRequest, request);
};
```

`HttpServerRequest.fromWeb` wraps a standard `Request` in the exact interface the server uses. This helper is the whole secret of middleware unit testing: _the current request is just another service, so fake it like one._

### The tests

Create `test/unit/auth-middleware.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { currentUserFromRequest } from "../../src/auth/middleware-live";
import { SessionService, SessionServiceLive } from "../../src/auth/session";
import { Unauthorized } from "../../src/shared/errors";
import { sessionStoreFromRows } from "../support/test-layers";

const sessionLayer = SessionServiceLive.pipe(
  Layer.provideMerge(
    sessionStoreFromRows([
      {
        token: "token-user",
        userId: "user-1",
        expiresAt: Number.MAX_SAFE_INTEGER,
        email: "user@example.com",
        role: "user",
        plan: "free",
      },
    ]),
  ),
);

const withRequest = (headers: Record<string, string>) => {
  const request = HttpServerRequest.fromWeb(
    new Request("http://localhost/api/links", { headers }),
  );
  return Effect.provideService(HttpServerRequest.HttpServerRequest, request);
};

const authenticate = Effect.gen(function* () {
  const sessions = yield* SessionService;
  return yield* currentUserFromRequest(sessions);
});

describe("currentUserFromRequest", () => {
  it.effect("resolves CurrentUser for a valid bearer token", () =>
    Effect.gen(function* () {
      const user = yield* authenticate.pipe(
        withRequest({ authorization: "Bearer token-user" }),
      );
      expect(user).toStrictEqual({
        userId: "user-1",
        email: "user@example.com",
        role: "user",
        plan: "free",
      });
    }).pipe(Effect.provide(sessionLayer)),
  );

  it.effect("fails with Unauthorized when the header is missing", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(authenticate.pipe(withRequest({})));
      expect(result).toStrictEqual(Exit.fail(new Unauthorized()));
    }).pipe(Effect.provide(sessionLayer)),
  );

  it.effect("fails with Unauthorized for a malformed header", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        authenticate.pipe(withRequest({ authorization: "token-user" })),
      );
      expect(result).toStrictEqual(Exit.fail(new Unauthorized()));
    }).pipe(Effect.provide(sessionLayer)),
  );

  it.effect("fails with Unauthorized for an unknown token", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        authenticate.pipe(withRequest({ authorization: "Bearer nope" })),
      );
      expect(result).toStrictEqual(Exit.fail(new Unauthorized()));
    }).pipe(Effect.provide(sessionLayer)),
  );
});
```

### What to notice

- **Real logic under the middleware.** We provide the _real_ `SessionServiceLive` over an in-memory store — not a stub of `SessionService` itself. That buys the token→session→expiry chain in one pass, while 6.2's tests keep pinpoint blame if expiry logic itself regresses. (Both choices are defensible; stub `SessionService` directly when its live layer becomes expensive to build.)
- **Every rejection is the same `Unauthorized`, by design** — clients learn nothing about _why_ authentication failed. The precise causes (`SessionNotFound` vs `SessionExpired`) were distinguishable one level down, in 6.2, where the operator-facing distinction lives. Test specificity at the layer that has it.
- **What about `AdminMiddleware`?** Same pattern plus a role fixture — an exercise. Seed a `role: 'admin'` session and a `role: 'user'` session; assert admin passes and non-admin fails `Forbidden`. Its through-the-pipeline behavior (403 on the real route) is covered in 9.3.

---

## 7.2 Testing HMAC middleware: signatures and config

### Why this target

`InternalMiddleware` guards Shortly's machine-to-machine endpoint. It combines three testing challenges in one small effect — header extraction, **cryptography** (HMAC-SHA256 verification), and **secret configuration** — and unlike auth, its failure modes include a _misconfiguration_ case that is criminally under-tested in most codebases: what happens when the secret isn't set at all?

The logic (from 5.2's refactor, exported as `verifiedInternalRequest`):

```ts
export const verifiedInternalRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const signature =
    request.headers["x-shortly-signature"] ??
    request.headers["X-Shortly-Signature"];

  if (!signature) return yield* Effect.fail(new Unauthorized());

  const secret = yield* requiredSecret("INTERNAL_HMAC_SECRET").pipe(
    Effect.catchTag("InvalidConfigError", () =>
      Effect.fail(new Unauthorized()),
    ),
  );

  const isValid = yield* Effect.tryPromise({
    try: () =>
      verifyHmac(Redacted.value(secret), INTERNAL_PURGE_INTENT, signature),
    catch: () => new Unauthorized(),
  });

  if (!isValid) return yield* Effect.fail(new Unauthorized());
});
```

The decision table:

| Scenario                             | Expected                                    |
| ------------------------------------ | ------------------------------------------- |
| correct signature, secret configured | passes                                      |
| missing signature header             | `Unauthorized`                              |
| signature made with the wrong secret | `Unauthorized`                              |
| secret not configured at all         | `Unauthorized` — **not** a crash, not a 500 |

### The tests

Create `test/unit/internal-middleware.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Exit } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import {
  INTERNAL_PURGE_INTENT,
  verifiedInternalRequest,
} from "../../src/auth/middleware-live";
import { Unauthorized } from "../../src/shared/errors";
import { signHmac } from "../../src/shared/hmac";

const testConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ INTERNAL_HMAC_SECRET: "test-secret" }),
);

const withSignature = (signature: string | null) => {
  const headers: Record<string, string> = {};
  if (signature !== null) headers["x-shortly-signature"] = signature;
  const request = HttpServerRequest.fromWeb(
    new Request("http://localhost/api/internal/purge", {
      method: "POST",
      headers,
    }),
  );
  return Effect.provideService(HttpServerRequest.HttpServerRequest, request);
};

describe("verifiedInternalRequest", () => {
  it.effect("accepts a correctly signed request", () =>
    Effect.gen(function* () {
      const signature = yield* Effect.promise(() =>
        signHmac("test-secret", INTERNAL_PURGE_INTENT),
      );
      const result = yield* Effect.exit(
        verifiedInternalRequest.pipe(withSignature(signature)),
      );
      expect(Exit.isSuccess(result)).toBe(true);
    }).pipe(Effect.provide(testConfig)),
  );

  it.effect("rejects a missing signature header", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        verifiedInternalRequest.pipe(withSignature(null)),
      );
      expect(result).toStrictEqual(Exit.fail(new Unauthorized()));
    }).pipe(Effect.provide(testConfig)),
  );

  it.effect("rejects a signature made with the wrong secret", () =>
    Effect.gen(function* () {
      const forged = yield* Effect.promise(() =>
        signHmac("wrong-secret", INTERNAL_PURGE_INTENT),
      );
      const result = yield* Effect.exit(
        verifiedInternalRequest.pipe(withSignature(forged)),
      );
      expect(result).toStrictEqual(Exit.fail(new Unauthorized()));
    }).pipe(Effect.provide(testConfig)),
  );

  it.effect("rejects when the secret is not configured", () =>
    Effect.gen(function* () {
      const signature = yield* Effect.promise(() =>
        signHmac("test-secret", INTERNAL_PURGE_INTENT),
      );
      const result = yield* Effect.exit(
        verifiedInternalRequest.pipe(withSignature(signature)),
      );
      expect(result).toStrictEqual(Exit.fail(new Unauthorized()));
    }).pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
    ),
  );
});
```

### What to notice

- **Don't stub the crypto — use it.** The valid-signature test computes a _real_ HMAC with the _same_ helper the middleware verifies with. Faking `verifyHmac` would test that a fake returns what you told it to. Using it proves sign and verify actually agree — which once caught a real bug in an earlier draft of `signHmac`'s hex encoding.
- **The forged-signature test is the security test.** Correct-signature-passes proves liveness; wrong-secret-fails proves _safety_. Suites that only test the happy path of security middleware are testing the lock opens, never that it locks.
- **The last test is the one your future self thanks you for.** The empty `ConfigProvider.fromUnknown({})` simulates the freshly deployed environment where someone forgot the secret. The middleware's `catchTag('InvalidConfigError', ...)` decides that means _reject requests_ rather than _crash the route_ — a real policy decision, now pinned by a test. Note how cheap this was: swap one provider layer. That is 4.5's promise cashed in.
- **`Effect.promise` for the signing helper** — `signHmac` is a plain async function, and infallible from the test's perspective, so `Effect.promise` (not `tryPromise`) is the honest wrapper.

---

# 8. Endpoint tests with HttpApiTest

_Level 3 of the pyramid — and Effect v4's best-kept testing secret._

### The gap between unit and integration

After chapters 6 and 7 you have proven your logic and your middleware. But nothing yet has exercised the machinery _between_ them: does the payload schema actually decode? Does `SlugTaken` actually serialize with its fields and come back as a typed error? Is `AuthMiddleware` actually attached to `createLink`? These are HTTP-pipeline concerns — and firing up workerd plus a database for each of them is a heavyweight answer.

Effect v4 ships a lightweight one: **`HttpApiTest`** (in `effect/unstable/httpapi`). It builds an **in-memory typed client** for your API that runs the _entire_ pipeline — request encoding, routing, middleware, payload decoding, your real handlers, response encoding, client-side decoding — as pure computation. No server. No sockets. No database, unless you provide one.

```ts
const client = yield* HttpApiTest.groups(shortlyApi, ['links'])
const link = yield* client.links.createLink({ payload: { ... } })   // fully typed
```

`groups` takes your `HttpApi` definition and the group names you want live. Selected groups use **your real handler layers from the context**; unselected groups get placeholders that die if called (so a test can't silently wander into unwired territory).

### Wiring: production shape, test parts

Create `test/unit/links-endpoints.test.ts`. First, the doubles:

```ts
import { NodeHttpServer } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { HttpApiTest } from "effect/unstable/httpapi";

import { shortlyApi } from "../../src/api";
import {
  AdminMiddleware,
  AuthMiddleware,
  CurrentUser,
  InternalMiddleware,
} from "../../src/auth/middleware";
import { SlugTaken } from "../../src/links/errors";
import { linksGroupLayer } from "../../src/links/endpoint-handlers";
import { LinkServiceLive } from "../../src/links/service";
import { IdServiceTest, LinkStoreTest } from "../support/test-layers";

const testUser = CurrentUser.of({
  userId: "user-1",
  email: "user@example.com",
  role: "user",
  plan: "free",
});

// Test doubles for the middleware: authentication is not what these tests
// are about, so we replace it with a layer that always provides a fixed user.
const AuthMiddlewareTest = Layer.succeed(AuthMiddleware, (httpEffect) =>
  Effect.provideService(httpEffect, CurrentUser, testUser),
);
const AdminMiddlewareTest = Layer.succeed(AdminMiddleware, (httpEffect) =>
  Effect.provideService(httpEffect, CurrentUser, testUser),
);
const InternalMiddlewareTest = Layer.succeed(
  InternalMiddleware,
  (httpEffect) => httpEffect,
);
```

Pause on `AuthMiddlewareTest`. A middleware _is a service_ whose value is a function over handler effects — so a fake middleware is just `Layer.succeed` with a function that injects a fixed user. Three lines replace the entire authentication stack. This is the layer system's deepest payoff: **even middleware is swappable**, because even middleware is a dependency.

Then the assembly:

```ts
// The group layer is wired exactly like production, except every
// dependency is a test double.
const linksHandlers = linksGroupLayer.pipe(
  // provideMerge keeps AuthMiddleware visible to HttpApiTest, which also
  // needs it when wiring the selected group.
  Layer.provideMerge(AuthMiddlewareTest),
  Layer.provide(LinkServiceLive),
  Layer.provide(LinkStoreTest),
  Layer.provide(IdServiceTest),
);

// HttpApiTest still builds placeholder routes for the unselected groups,
// so their middleware services must be present as well.
const testLayer = Layer.mergeAll(
  linksHandlers,
  AdminMiddlewareTest,
  InternalMiddlewareTest,
  NodeHttpServer.layerHttpServices,
);
```

Three wiring facts, each learned the hard way while building this course (you'll meet their error messages in chapter 10):

1. **Middleware must be provided _into_ the group layer** (`linksGroupLayer.pipe(Layer.provide/provideMerge(...))`), because HttpApi resolves middleware services when the group layer is _built_, not per request. Merging the middleware next to the group layer instead produces a runtime `Service not found: shortly/AuthMiddleware`.
2. **It must be `provideMerge` for the selected group's middleware**, because `HttpApiTest.groups` _also_ needs the middleware service visible when it assembles the API — plain `provide` would consume and hide it.
3. **`NodeHttpServer.layerHttpServices`** supplies the platform services (`FileSystem`, `Path`, `Etag.Generator`, `HttpPlatform`) that the HTTP machinery requires even in memory.

### The tests

```ts
describe("links endpoints (in-memory client)", () => {
  it.effect("createLink responds with the created link", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(shortlyApi, ["links"]);

      const link = yield* client.links.createLink({
        payload: {
          url: "https://effect.website",
          customSlug: "docs",
          ttlMs: null,
        },
      });

      expect(link.slug).toBe("docs");
      expect(link.clicks).toBe(0);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("createLink surfaces SlugTaken as a typed client error", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(shortlyApi, ["links"]);
      const payload = {
        url: "https://effect.website",
        customSlug: "dupe",
        ttlMs: null,
      };

      yield* client.links.createLink({ payload });
      const result = yield* Effect.exit(client.links.createLink({ payload }));

      expect(result).toStrictEqual(Exit.fail(new SlugTaken({ slug: "dupe" })));
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("getLink round-trips the success schema", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(shortlyApi, ["links"]);
      yield* client.links.createLink({
        payload: {
          url: "https://effect.website",
          customSlug: "mine",
          ttlMs: null,
        },
      });

      const link = yield* client.links.getLink({ params: { slug: "mine" } });
      expect(link.targetUrl).toBe("https://effect.website");
    }).pipe(Effect.provide(testLayer)),
  );
});
```

### Read the second test twice

```ts
expect(result).toStrictEqual(Exit.fail(new SlugTaken({ slug: "dupe" })));
```

Trace what had to go right for that single assertion to pass: the handler failed with `SlugTaken` → HttpApi looked it up in the endpoint's declared `error` list → serialized it (status 409, tagged JSON body with `slug`) → the client received the response → matched the status → decoded the body _back into a real `SlugTaken` instance_ → delivered it in the typed error channel. One `toStrictEqual` proves the **entire error contract round-trips**. This is the test that catches "I renamed a field on the error but only on one side" — the class of bug that unit tests structurally cannot see and that usually waits for a frontend developer to find.

### Where this level shines — and where it stops

Use `HttpApiTest` for: schema round-trips (success _and_ error), handler↔service integration, "is the right middleware attached" (swap in a middleware double that fails, or select a group _without_ providing a real user and watch the typed `Unauthorized` surface), and fast contract regression tests you can run in watch mode.

It cannot see: real config resolution, real databases, platform quirks — and by construction it speaks _your API definition_, so it can't represent a malformed raw request (there's no way to even _type_ a three-character slug into the client — the payload type won't let you). Malformed input testing therefore belongs to level 4, where requests are raw. That's next.

---

# 9. Integration testing on Cloudflare Workers _(parent chapter — no page)_

_Level 4: the production runtime, the production layers, a real database. Three pages — the runtime story, the store tests, and the full-stack route tests._

---

## 9.1 Running tests inside workerd

### Why not just test in Node?

Shortly _runs_ on Cloudflare Workers. Its database is D1, reachable only as a Workers binding (`env.DB`). You could stand up a look-alike in Node — an in-memory SQLite with a shimmed binding — and for some projects that's a reasonable 80% answer. But it leaves permanent gaps: the shim's error messages aren't D1's (remember 6.3 — error _messages_ are load-bearing), the runtime isn't workerd, and `cloudflare:workers` imports need constant stubbing.

`@cloudflare/vitest-pool-workers` deletes the whole problem: **your tests execute inside workerd**, the same engine that runs your Worker in production. `import { env } from 'cloudflare:workers'` works _in the test file_. `env.DB` is a real D1 database, private to your tests. Your production layers — `DbServiceLive` included — run **unchanged**.

### The moving parts

You configured this in chapter 3; now let's actually read it.

```ts
// vitest.workers.config.ts
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.join(__dirname, "migrations"),
          ),
          INTERNAL_HMAC_SECRET: "test-internal-secret",
        },
      },
    })),
  ],
  test: {
    include: ["test/store/**/*.test.ts", "test/integration/**/*.test.ts"],
    setupFiles: ["./test/support/apply-migrations.ts"],
  },
});
```

- **`cloudflareTest()`** is the Vitest-4-era plugin API (≥ 0.13). It reads your real `wrangler.jsonc` — bindings, compatibility date, `nodejs_compat` — so the test runtime is configured _from the same file_ as production.
- **`readD1Migrations` + `TEST_MIGRATIONS`** ship your real migration files into the runtime as a binding, and the setup file applies them:

```ts
// test/support/apply-migrations.ts
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- **`INTERNAL_HMAC_SECRET`** — remember that in production, `Config` reads the Worker's environment. Here the test config provides a known secret _through the same channel_, so `verifiedInternalRequest` runs completely unmodified in 9.3.

### The isolation model — read this box twice

> **Storage is isolated per test FILE, not per test.** Each file gets a fresh database (migrated by the setup file); tests _within_ a file share it and run in order.

This is the pool's Vitest-4 behavior (older tutorials describe per-test isolation with an `isolatedStorage` option — that option no longer exists). It has one big consequence for how you write tests, and it bit us while building this course: a suite where several tests each seeded `user-1` passed individually and failed together — `UNIQUE constraint failed: users.email` — because they shared one database. The pattern that fixes it, used throughout 9.3:

```ts
let seedCounter = 0;
async function seedTestUser(opts = {}) {
  const id = `user-${++seedCounter}`; // unique per test, by construction
  const token = `token-${seedCounter}`;
  // ...insert user + session...
  return { id, token };
}
```

Unique data per test, and no cross-test assertions on global counts (you'll see the purge test in 9.3 handle this explicitly). If you truly need shared storage semantics across files, `--max-workers=1 --no-isolate` exists — but designing for per-file isolation is the durable answer.

### Typing the test-only bindings

One small ceremony so TypeScript knows about `TEST_MIGRATIONS`:

```ts
// test/support/cloudflare-env.d.ts
/// <reference types="@cloudflare/vitest-pool-workers/types" />

declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
```

### A note on environments that can't run workerd

`workerd` is a native binary. It runs fine on developer machines and standard CI (GitHub Actions `ubuntu-latest`, etc.), but some heavily sandboxed environments block syscalls it needs and it will crash at startup. If that happens to you: nothing is wrong with your tests. Run them where workerd runs. (This course's own store and integration tests were additionally verified against a real SQLite database in plain Node during development, precisely because the authoring sandbox couldn't boot workerd — the SQL, the handlers and the middleware behavior are identical.)

---

## 9.2 Testing I/O stores against real D1

### Why this target

`LinkStoreLive` is ~100 lines of Drizzle queries — the code that unit tests, by design, never touched. Every behavior here is a claim about _SQL_: that the unique constraint fires, that `RETURNING` counts what was deleted, that the expiry comparison in `deleteExpired` matches the one in the service. In-memory fakes can't falsify any of that. Only the real database can — so that's what we use.

The one-line wiring miracle first. Create `test/store/link-store.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { DbServiceLive } from "../../src/db/db-live";
import { LinkStore } from "../../src/links/link-store";
import { LinkStoreLive } from "../../src/links/link-store-live";
import { isUniqueViolation } from "../../src/shared/errors";
import { seedUser } from "../support/seed";

// The production store and database layers, unchanged: inside workerd,
// `env.DB` is the isolated test database.
const testLayer = LinkStoreLive.pipe(Layer.provide(DbServiceLive));
```

That is the payoff of chapter 2's "one platform-specific file" rule, cashed in: because `DbServiceLive` reads `env.DB` from `cloudflare:workers`, and because the test pool populates that binding, _the literal production layer is the test layer._

And a seeding helper, since `links.user_id` has a foreign key:

```ts
// test/support/seed.ts (excerpt)
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../src/db/schema";

export const testDb = () => drizzle(env.DB, { schema });

export async function seedUser(options: SeedUserOptions) {
  const db = testDb();
  await db.insert(schema.users).values({ id: options.id /* ... */ });
  if (options.sessionToken) {
    await db
      .insert(schema.sessions)
      .values({ token: options.sessionToken /* ... */ });
  }
}
```

Arranging state by writing to the database directly is correct at this level — we're testing the store, not the signup flow.

### The tests

```ts
const baseLink = {
  id: "link_1",
  slug: "effect",
  userId: "user-1",
  targetUrl: "https://effect.website",
  createdAt: 1_000,
  expiresAt: null,
};

describe("LinkStore (real D1)", () => {
  it.effect("insert / findBySlug round-trips a row", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => seedUser({ id: "user-1" }));
      const store = yield* LinkStore;

      const inserted = yield* store.insert(baseLink);
      expect(inserted.clicks).toBe(0);

      const found = yield* store.findBySlug("effect");
      expect(found).toStrictEqual({ ...baseLink, clicks: 0 });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "fails with a unique-constraint ShortlyDbError for duplicate slugs",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedUser({ id: "user-1" }));
        const store = yield* LinkStore;

        yield* store.insert(baseLink);
        // Effect.flip turns the failure channel into the success channel,
        // handy when you want to inspect an error that has no Equal instance.
        const error = yield* Effect.flip(
          store.insert({ ...baseLink, id: "link_2" }),
        );

        expect(error._tag).toBe("ShortlyDbError");
        expect(isUniqueViolation(error.cause)).toBe(true);
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("countByUser counts only the given user", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => seedUser({ id: "user-1" }));
      yield* Effect.promise(() => seedUser({ id: "user-2" }));
      const store = yield* LinkStore;

      yield* store.insert(baseLink);
      yield* store.insert({
        ...baseLink,
        id: "link_2",
        slug: "other",
        userId: "user-2",
      });

      expect(yield* store.countByUser("user-1")).toBe(1);
      expect(yield* store.countByUser("user-3")).toBe(0);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("incrementClicks adds one atomically", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => seedUser({ id: "user-1" }));
      const store = yield* LinkStore;
      yield* store.insert(baseLink);

      yield* store.incrementClicks("effect");
      yield* store.incrementClicks("effect");

      const found = yield* store.findBySlug("effect");
      expect(found?.clicks).toBe(2);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("deleteForUser refuses to delete another user's link", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => seedUser({ id: "user-1" }));
      const store = yield* LinkStore;
      yield* store.insert(baseLink);

      expect(yield* store.deleteForUser("user-2", "effect")).toBe(false);
      expect(yield* store.deleteForUser("user-1", "effect")).toBe(true);
      expect(yield* store.findBySlug("effect")).toBeNull();
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("deleteExpired removes only rows past their expiry", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => seedUser({ id: "user-1" }));
      const store = yield* LinkStore;

      yield* store.insert({ ...baseLink, expiresAt: 5_000 });
      yield* store.insert({
        ...baseLink,
        id: "link_2",
        slug: "alive",
        expiresAt: 99_000,
      });
      yield* store.insert({
        ...baseLink,
        id: "link_3",
        slug: "forever",
        expiresAt: null,
      });

      const purged = yield* store.deleteExpired(10_000);

      expect(purged).toBe(1);
      expect(yield* store.findBySlug("effect")).toBeNull();
      expect(yield* store.findBySlug("alive")).not.toBeNull();
      expect(yield* store.findBySlug("forever")).not.toBeNull();
    }).pipe(Effect.provide(testLayer)),
  );
});
```

### What to notice

- **The duplicate-slug test is 6.3's other half.** The unit test proved _your_ translation logic against a hand-written error; this one proves the _real_ error carries a message your `isUniqueViolation` recognizes — through Drizzle's `DrizzleQueryError` wrapping and all. Together they close the loop; either alone leaves a seam for the exact regression described in 6.3.
- **`deleteExpired`'s three-row fixture earns its keep**: expired (deleted), future (kept), and — the case in-memory fakes love to fumble — `expiresAt: null` (kept; `NULL` never satisfies `<=` in SQL, and now that's _pinned_, not assumed).
- **Store tests assert on rows and SQL effects, not business meaning.** No plan limits here, no `SlugTaken` — those are the service's concern (level 1). If you find business assertions creeping into store tests, some logic has leaked into your store; move it up.
- **`Effect.promise` bridges the seeding helper** — seeding is plain async Drizzle, and wrapping it per-call keeps the store's Effect interface as the only Effect surface under test.

---

## 9.3 Full-stack integration tests

### The last mile

Everything so far trusted _some_ wiring. This chapter trusts nothing: it imports the **production worker entry** and feeds it raw HTTP requests. Real router, real middleware (looking up real sessions in the real database), real schema validation, real handlers, real stores, real status codes and bodies.

```ts
import worker from "../../src/worker";

const api = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`http://localhost${path}`, init));
```

Note that these tests use plain `it` from `vitest`, `async/await`, and `fetch`-style requests — **no Effect imports for the test bodies at all**. That is deliberate and worth defending: at this level, the API is a black box that speaks HTTP. Writing black-box tests in the vocabulary of the box's _implementation_ would quietly couple them to it. If you rewrote Shortly in another framework tomorrow, this file should still compile and still pass.

### The support cast

Create `test/integration/api.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import worker from "../../src/worker";
import { INTERNAL_PURGE_INTENT } from "../../src/auth/middleware-live";
import { signHmac } from "../../src/shared/hmac";
import { seedUser, testDb } from "../support/seed";
import * as schema from "../../src/db/schema";

const api = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`http://localhost${path}`, init));

const authed = (token: string) => ({
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
});

// Storage is isolated per test FILE, not per test, so every test seeds
// unique users and slugs to stay independent of its neighbours.
let seedCounter = 0;
async function seedTestUser(opts: { role?: string; expired?: boolean } = {}) {
  const id = `user-${++seedCounter}`;
  const token = `token-${seedCounter}`;
  await seedUser({
    id,
    role: opts.role ?? "user",
    sessionToken: token,
    ...(opts.expired ? { sessionExpiresAt: Date.now() - 1_000 } : {}),
  });
  return { id, token };
}

const linkPayload = (customSlug: string | null, ttlMs: number | null = null) =>
  JSON.stringify({ url: "https://effect.website", customSlug, ttlMs });
```

### The create-link suite: one route, five contracts

```ts
describe("POST /api/links", () => {
  it("responds 401 without a bearer token", async () => {
    const response = await api("/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: linkPayload(null),
    });
    expect(response.status).toBe(401);
  });

  it("creates a link and responds 201 with the encoded link", async () => {
    const { token } = await seedTestUser();

    const response = await api("/api/links", {
      method: "POST",
      headers: authed(token),
      body: linkPayload("docs"),
    });

    expect(response.status).toBe(201);
    const body = await response.json<{ slug: string; clicks: number }>();
    expect(body.slug).toBe("docs");
    expect(body.clicks).toBe(0);
  });

  it("responds 400 when the payload fails schema validation", async () => {
    const { token } = await seedTestUser();

    const response = await api("/api/links", {
      method: "POST",
      headers: authed(token),
      // "NO SPACES!" violates the custom slug pattern
      body: linkPayload("NO SPACES!"),
    });

    expect(response.status).toBe(400);
  });

  it("responds 409 with a typed error body for a duplicate slug", async () => {
    const { token } = await seedTestUser();

    await api("/api/links", {
      method: "POST",
      headers: authed(token),
      body: linkPayload("dupe"),
    });
    const response = await api("/api/links", {
      method: "POST",
      headers: authed(token),
      body: linkPayload("dupe"),
    });

    expect(response.status).toBe(409);
    const body = await response.json<{ _tag: string; slug: string }>();
    expect(body._tag).toBe("SlugTaken");
    expect(body.slug).toBe("dupe");
  });

  it("responds 401 for an expired session", async () => {
    const { token } = await seedTestUser({ expired: true });

    const response = await api("/api/links", {
      method: "POST",
      headers: authed(token),
      body: linkPayload(null),
    });

    expect(response.status).toBe(401);
  });
});
```

Each test states a clause of the public contract. Two deserve commentary:

- **The 400 test could not exist at any lower level.** The typed client of chapter 8 won't let you _construct_ an invalid payload — the type system forbids it. Only raw HTTP can deliver garbage, and only this level proves the schema guard actually stands in front of your handler. (While building this course, an earlier draft used a 3-character slug in a _different_ test and got a mysterious 404 two requests later — the 400 had happened silently upstream. The schema layer is always on; test it deliberately or debug it accidentally.)
- **The expired-session 401** is the full-stack echo of 6.2's TestClock test — same rule, now proven through the real middleware against a real `sessions` row with a real past timestamp.

### Ownership, redirects, admin, HMAC

```ts
describe("GET /api/links/:slug", () => {
  it("responds 404 for another user's link", async () => {
    const alice = await seedTestUser();
    const bob = await seedTestUser();

    await api("/api/links", {
      method: "POST",
      headers: authed(alice.token),
      body: linkPayload("secret"),
    });

    const response = await api("/api/links/secret", {
      headers: authed(bob.token),
    });
    expect(response.status).toBe(404);
    const body = await response.json<{ _tag: string }>();
    expect(body._tag).toBe("LinkNotFound");
  });
});

describe("GET /r/:slug", () => {
  it("redirects with a 302 and counts the click", async () => {
    const { token } = await seedTestUser();
    await api("/api/links", {
      method: "POST",
      headers: authed(token),
      body: linkPayload("jump"),
    });

    const response = await api("/r/jump", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://effect.website");

    const link = await api("/api/links/jump", { headers: authed(token) });
    const body = await link.json<{ clicks: number }>();
    expect(body.clicks).toBe(1);
  });

  it("responds 410 for an expired link", async () => {
    const { id } = await seedTestUser();
    const db = testDb();
    await db.insert(schema.links).values({
      id: "link_gone",
      slug: "gone",
      userId: id,
      targetUrl: "https://effect.website",
      clicks: 0,
      createdAt: Date.now() - 10_000,
      expiresAt: Date.now() - 5_000,
    });

    const response = await api("/r/gone", { redirect: "manual" });
    expect(response.status).toBe(410);
  });
});

describe("POST /api/admin/users/:userId/plan", () => {
  it("responds 403 for a signed-in non-admin", async () => {
    const { id, token } = await seedTestUser();

    const response = await api(`/api/admin/users/${id}/plan`, {
      method: "POST",
      headers: authed(token),
      body: JSON.stringify({ plan: "pro" }),
    });

    expect(response.status).toBe(403);
  });

  it("lets an admin change a plan", async () => {
    const user = await seedTestUser();
    const admin = await seedTestUser({ role: "admin" });

    const response = await api(`/api/admin/users/${user.id}/plan`, {
      method: "POST",
      headers: authed(admin.token),
      body: JSON.stringify({ plan: "pro" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ ok: true });
  });
});

describe("POST /api/internal/purge", () => {
  it("responds 401 for a bad signature", async () => {
    const response = await api("/api/internal/purge", {
      method: "POST",
      headers: { "x-shortly-signature": "not-a-signature" },
    });
    expect(response.status).toBe(401);
  });

  it("purges expired links for a correctly signed request", async () => {
    const signature = await signHmac(
      "test-internal-secret",
      INTERNAL_PURGE_INTENT,
    );

    // Flush anything earlier tests in this file left behind, so the exact
    // count below only reflects this test's own data.
    await api("/api/internal/purge", {
      method: "POST",
      headers: { "x-shortly-signature": signature },
    });

    const { id } = await seedTestUser();
    const db = testDb();
    await db.insert(schema.links).values({
      id: "link_stale",
      slug: "stale",
      userId: id,
      targetUrl: "https://effect.website",
      clicks: 0,
      createdAt: 0,
      expiresAt: 1,
    });

    const response = await api("/api/internal/purge", {
      method: "POST",
      headers: { "x-shortly-signature": signature },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ purged: 1 });
  });
});
```

### What to notice

- **The redirect test asserts through three doors:** status (302), header (`location`), and _persisted side effect_ (the click count, read back through the API — not the database — keeping the test black-box). Also note `redirect: 'manual'`: without it, `fetch` semantics would follow the 302 to the real internet and your test would depend on `effect.website`'s uptime.
- **The 403 test is the one that catches the worst bug this API could have.** A missing `.middleware(AdminMiddleware)` on the endpoint definition breaks no unit test, no endpoint test with middleware doubles, no happy-path admin test — _only_ the "normal user gets 403" request can see it. Every privileged route in your own API deserves this exact test.
- **The purge test negotiates per-file isolation honestly.** It cannot know what expired links its file-mates left behind, so it flushes first, then seeds exactly one, then asserts _exactly_ `{ purged: 1 }`. That's the discipline from 9.1 turned into a concrete pattern: when a test asserts on a global aggregate, first make the world small.
- **HMAC round-trips against real config.** `signHmac` here signs with `'test-internal-secret'` — the value the vitest config injected as a Worker binding — and the middleware reads it back through Effect `Config` inside workerd. Configuration, crypto, middleware, handler: one green test, zero mocks, nothing stubbed anywhere in the stack.

With this file green, look back at the pyramid: services proven in isolation, middleware proven with fakes, contracts proven in memory, and now the assembled system proven in its production runtime. That is what "comprehensively tested" means in this course — every claim falsifiable, each at the cheapest level able to falsify it.

---

# 10. Gotchas and best practices _(parent chapter — no page)_

_Everything that cost us an hour so it costs you a minute — then the whole course compressed into a checklist you can run against your own backend._

---

## 10.1 Gotchas that will bite you

These are ordered roughly by how likely you are to meet them in your first week. Several were discovered live while building this course's test suite; those include the symptom you'll actually see in your terminal.

### 1. Middleware resolves at _layer build time_ — provide it INTO the group layer

**Symptom:**

```
Error: Service not found: shortly/AuthMiddleware
    at applyMiddleware (.../HttpApiBuilder.js:...)
```

...even though `AuthMiddlewareTest` is sitting _right there_ in your `Layer.mergeAll`.

**Cause:** HttpApi converts handlers to routes — and looks up each endpoint's middleware services — **while the group layer is being built**, not when requests arrive. Middleware merged _beside_ the group layer isn't visible _to_ it.

**Fix:** provide middleware as an **input** of the group layer, exactly like production wiring does:

```ts
// ❌ wrong — middleware beside the group layer
Layer.mergeAll(linksGroupLayer, AuthMiddlewareTest, ...)

// ✅ right — middleware into the group layer
linksGroupLayer.pipe(Layer.provideMerge(AuthMiddlewareTest), Layer.provide(LinkServiceLive), ...)
```

And for `HttpApiTest`, remember the second half: use `provideMerge` (not `provide`) for the selected group's middleware, because the test assembler needs to see it too — and unselected groups' middleware must be merged into the final test layer, since placeholder routes are still built for them.

### 2. Drizzle wraps driver errors — never match on the top-level message

**Symptom:** your unique-violation detection silently stops matching after a Drizzle upgrade; races that used to become `SlugTaken` (409) become defects (500).

**Cause:** Drizzle (≥ 0.4x) wraps driver errors in `DrizzleQueryError` — top-level message `Failed query: ...`, with the real `UNIQUE constraint failed: links.slug` on `error.cause` (sometimes two levels down).

**Fix:** walk the cause chain (see `isUniqueViolation` in 6.3) — and keep **both** tests: the unit test with a hand-built error (pins your logic) and the store test against real D1 (pins the library's actual shape). Any code that string-matches error messages is a treaty with a third party; tests are how you verify the treaty each upgrade.

### 3. Schema validation runs before your handler — and before your test's assumption

**Symptom:** a test fails with a baffling 404 (or empty list) when the request _before_ the one you're debugging got a silent 400.

We hit this exactly: a redirect test created a link with slug `hop` — three characters, but the payload schema demands `{4,32}` — the create returned 400, the test then asked for `/r/hop` and got a confident 404.

**Fix / habits:** in integration tests, assert on the status of _arrange_ requests too when debugging (`expect(created.status).toBe(201)` costs nothing); keep payload fixtures in one helper (`linkPayload(...)`) so constraints live in one place; and treat "an endpoint returned 404 for a thing I just created" as a prompt to check the creation, not the lookup.

### 4. Workers-pool storage isolation is per FILE, not per test

**Symptom:** every test passes alone; the file fails together, with `UNIQUE constraint failed: users.email` on a seed call, or an aggregate assertion (`purged: 1`) seeing a bigger number.

**Cause:** since `@cloudflare/vitest-pool-workers` 0.13 (Vitest 4), each test _file_ gets one fresh database; tests within it share state. Older docs describing per-test `isolatedStorage` no longer apply.

**Fix:** unique fixtures per test (the `seedCounter` pattern), and for aggregate assertions, flush-then-seed-then-assert-exact (the purge pattern in 9.3).

### 5. TestClock doesn't reach inside promises

**Symptom:** a test hangs (or times out) after `TestClock.adjust(...)`.

**Cause:** `TestClock` controls Effect's clock — `Clock`, `Effect.sleep`, timeouts, schedules. A real `setTimeout` inside an `Effect.tryPromise(() => somePromise)` runs on the _real_ timer; adjusting virtual time can't fire it, and if your effect is waiting on it, nothing ever progresses.

**Fix:** keep timing on the Effect side of the boundary (`Effect.sleep`, `Effect.timeout` around the promise-wrapping effect, not inside the promise). If third-party code sleeps internally on real timers, test it with `it.live` — and quarantine it behind a service so the rest of your logic stays on the virtual clock.

### 6. Defects don't appear in `error:` lists — don't try to assert them as typed errors

**Symptom:** you expect a 500-producing scenario to show up as a typed client error in an `HttpApiTest` test, but the effect dies instead; or you try to add your DB error to an endpoint's `error:` list and the types fight you.

**Cause & fix:** by design. `Effect.die` removes the failure from the typed channel — that's the _point_ (4.3). Assert defects at the integration level as status 500 with an opaque body, and — equally important — assert that the body _doesn't_ leak internals. If you find yourself wanting a typed 500, what you actually want is a domain error like `ServiceUnavailable` with `httpApiStatus: 503`, failed (not died) deliberately.

### 7. Logs vanish inside `it.effect`

Not a bug — `it.effect` suppresses log output so suites stay readable. When debugging, either provide a logger for one test (`Effect.provide(Logger.layer([Logger.consolePretty()]))` in v4) or temporarily switch that test to `it.live`. Remember to switch back; `it.live` also swaps your TestClock for the real one, which changes time-dependent behavior.

### 8. Beta version skew across Effect packages

**Symptom:** incomprehensible type errors deep inside `effect` internals — two copies of a type that "should" be the same, `Context` incompatibilities, `yield*` refusing an effect.

**Cause:** `effect`, `@effect/platform-node` and `@effect/vitest` at _different_ beta versions. All v4 ecosystem packages release in lockstep and must match exactly.

**Fix:** pin exact versions (no `^`), upgrade all together, and when weird type errors appear after an install, check `npm ls effect` for duplicates before debugging anything else.

### 9. `Layer.provide` vs `Layer.provideMerge` — wire-and-hide vs wire-and-expose

Recurred throughout the course, so once more as a rule: **`provide`** satisfies a dependency and _removes it_ from the visible outputs; **`provideMerge`** satisfies it and _keeps it visible_. Use `provideMerge` whenever the test itself needs to reach the lower service (asserting on store contents, seeding sessions); use `provide` when the dependency is an implementation detail. If a test suddenly reports a missing service that you "definitely provided", you almost always provided it with the hiding variant one level too deep.

### 10. `fetch` follows redirects — integration tests must say `redirect: 'manual'`

Without it, a 302 test follows the Location header out to the live internet: slow, flaky, and asserting on someone else's website. With `redirect: 'manual'` you assert on _your_ response: status 302, `location` header, done.

---

## 10.2 A testing checklist for your own API

The course, compressed. Run this against your own Effect HTTP API backend — each unchecked box is a concrete, known risk.

**Design for testability (before writing tests)**

- [ ] Every I/O dependency is a `Context.Service` with an interface file importable without platform modules
- [ ] Exactly one place imports platform bindings (`cloudflare:workers` / process env / SDK clients) — the edge of the layer graph
- [ ] Middleware bodies contain **zero** direct I/O — all lookups go through services provided via `Layer.effect`
- [ ] Middleware logic is exported as standalone effects; wrappers are one-liners
- [ ] No `Date.now()` in domain logic — `Clock.currentTimeMillis` everywhere a decision depends on time
- [ ] No inline `crypto.randomUUID()` where the value matters — an `IdService`
- [ ] Secrets and settings read via `Config`, never bare env access
- [ ] Domain errors are `Schema.TaggedErrorClass` with `httpApiStatus`, declared in endpoint `error:` lists; infrastructure failures are separate types that handlers `Effect.die`

**Unit tests — services (Node, fast)**

- [ ] Every error in every service method's signature has a test that produces it
- [ ] In-memory test layers implement the _full_ store interface (compiler-checked), fresh per test
- [ ] Deterministic `IdService` → exact-value assertions
- [ ] Time-dependent rules tested at the boundary (t−1 valid, t invalid) with `TestClock`
- [ ] Error _translation_ tested with one-off stub layers (e.g. unique-violation → domain conflict)
- [ ] Security-relevant policies (anti-enumeration, ownership) pinned by name

**Unit tests — middleware**

- [ ] Auth: valid, missing header, malformed header, unknown token, expired session
- [ ] Role checks: privileged passes, unprivileged gets the _distinct_ error (`Forbidden`, not `Unauthorized`)
- [ ] Signature middleware: valid signature, missing, forged, **and missing configuration**
- [ ] All via `HttpServerRequest.fromWeb(new Request(...))` + stub layers — no pipeline, no DB

**Endpoint tests (`HttpApiTest`)**

- [ ] Success schema round-trip for each representative endpoint (status + decoded body)
- [ ] Error contract round-trip: typed error out of handler = typed error into client (`Exit.fail(new DomainError(...))`)
- [ ] Middleware provided **into** group layers; doubles for what's out of scope

**Store & integration tests (workerd, real D1)**

- [ ] Store tests use the unchanged production `DbServiceLive` + store layer
- [ ] Real constraint violations produced and classified (unique, FK)
- [ ] SQL edge semantics pinned: `NULL` handling, `RETURNING` counts, scoped deletes
- [ ] Full-stack per protected route: 401 unauthenticated; 403 for authenticated-but-unprivileged on **every** admin route
- [ ] 400 for schema-invalid payloads (raw HTTP — the level below can't express them)
- [ ] Typed error bodies as raw JSON (`_tag` + fields + status)
- [ ] Non-JSON responses (redirects: status + headers + side effects, `redirect: 'manual'`)
- [ ] Machine auth round-trip with config injected through the test runtime
- [ ] Per-file isolation respected: unique fixtures per test; flush-then-seed for aggregate assertions

**Suite hygiene**

- [ ] Two configs: unit (Node, watchable, sub-second) and workers (workerd, pre-push/CI)
- [ ] `tsc --noEmit` in CI — type errors in _tests_ are test failures
- [ ] Exact-pinned, matching Effect beta versions
- [ ] Every behavior tested at exactly one level (contract excepted) — no compensating double coverage

---

# 11. Where to go from here

You now hold the complete toolkit this course set out to give you: test layers instead of mocks, `it.effect` and the Exit/flip idioms, TestClock discipline, middleware testing through extracted effects, `HttpApiTest`'s in-memory contract tests, and real-runtime integration testing with `vitest-pool-workers`. More importantly, you have a _decision procedure_ — the pyramid and its assignment rule — that tells you where any new behavior's test belongs before you write it.

Some directions to grow from here:

**Apply it to your backend this week.** Run the 10.2 checklist. If your middleware does direct I/O, do the 5.2 extraction first — it is mechanical, behavior-preserving, and unlocks everything else. Then write the four middleware tests and the one integration 403 test for every admin route. That alone puts you ahead of most production codebases.

**Property-based testing.** `@effect/vitest` ships `it.effect.prop`, generating inputs from your schemas via FastCheck. Natural fits in Shortly: "no sequence of create/delete operations can exceed the plan limit," or round-trip laws for your schemas. Reach for properties when examples feel like whack-a-mole.

**Concurrency testing.** Effect's structured concurrency is testable with the same tools: `Effect.fork` + `TestClock.adjust` lets you deterministically interleave racing fibers. The 6.3 stub-store technique generalizes to any "what if the world changed between my check and my act" scenario.

**Coverage as a map, not a score.** `vitest run --coverage` works in both configs. Use it to find _unvisited decision branches_ (an untested `catchTag` is a real risk), not to chase a percentage.

**Contract tests for real consumers.** The `HttpApiClient` your tests derive is the same client your frontend can use. Publishing the api definition and testing against it from the consumer side turns your chapter-8 tests into cross-team contract tests.

**When Effect v4 goes stable**, the `unstable/httpapi` modules will graduate and import paths will simplify; the concepts here — layers, clocks, typed errors, the pyramid — are the durable part. Watch the [effect-smol releases](https://github.com/Effect-TS/effect-smol/releases) and [effect.website](https://effect.website) for the announcement, and re-pin deliberately.

One closing thought. Every technique in this course reduces to a single idea applied over and over:

> **Make every dependency explicit, and testing stops being an act of deception — no mocks, no patches, no lies — and becomes an act of composition.**

Wire the graph differently, and the same code that serves production proves itself in microseconds on your laptop. That is not a testing trick. It is what Effect was for all along.

_— End of course —_
