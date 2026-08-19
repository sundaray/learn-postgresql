# Forum feature: design notes and handoff

Status: **build order steps 1 to 9 done; the API is assembled and deployable.**
Everything below is decided unless section 13 lists it as open. A fresh session
should be able to read this file and start at section 12 (build order), which
now means step 10. Sections 14 to 16 were written during the build and record
what was learned against the framework, the test setup and the API itself;
where they contradict an earlier section, they win.

**Never guess at an Effect API.** The project root contains the Effect v4 source
in `effect/`. Read it rather than inventing a signature. See section 11.

Last updated: 2026-08-19 (build order step 9 done; section 16 added)

---

## 1. What we are building

A discussion forum attached to the lessons. A reader on
`/lessons/how-postgresql-executes-sql` can open a Discuss link and either ask a
question or start a general discussion about that lesson.

Reading a lesson needs no account. Reading the forum needs no account either.
Writing does: a signed-out visitor who tries to post is sent to `/login` with a
`redirectTo`, and lands back where they were after signing in.

Requested stack, confirmed:

- **Frontend state:** Effect Atom (`@effect/atom-react`)
- **Backend:** Effect HTTP API (`effect/unstable/httpapi`)

---

## 2. Reference code (borrow from, do not copy)

There is a complete older forum in a different project:

```
repo:    /Users/hemanta/Documents/effective-dev
branch:  origin/forum        (30 commits ahead of origin/main, ~180 forum files)
```

What is in it:

| Path | What it holds |
|---|---|
| `apps/forum-api/` | Effect HTTP API as a standalone Cloudflare Worker. Six groups: posts, replies, discussions, profile, views, moderation. Each group has `endpoints.ts`, `errors.ts`, `handlers.ts`, `schemas.ts`, `service.ts`, `tests/`. |
| `apps/web/features/forum/` | Next.js + Effect Atom frontend. `AtomHttpApi` client, per-domain `atoms.ts`, component tests. |
| `apps/shared/forum/` | Constants, validation rules, schemas, text helpers. |
| `packages/db/src/schema.ts` | Drizzle Postgres tables. |

Read it with `git show origin/forum:<path>` from that repo.

**It is old and structured badly in places. Do not port it as-is.** Known
problems to avoid:

- The `forums` table held threads while `forum_posts` held replies, so
  "forum post" meant the top-level item in one file and the reply in another.
  `ForumPostService` and `ForumPostReplyService` sat side by side.
- Component names piled up: `forum-posts.tsx`, `forum-post-view.tsx`,
  `forum-post-view-header.tsx`, `forum-post-list-empty-state.tsx`.
- A `forumCookieHeaderAtom` plus `FORUM_API_INTERNAL_URL` existed only because
  the API was a separate worker and SSR had to forward cookies to it.

Write fresh code from the skills listed in section 11 instead.

---

## 3. Decisions taken

All of these are settled.

| # | Decision | Why |
|---|---|---|
| 1 | **Cloudflare D1, same database** as Better Auth | Real foreign keys to the existing `user` table, one migration path, no connection pooling problem in Workers, no new binding or secret in `alchemy.run.ts`. The app's own store is D1/SQLite even though the course teaches PostgreSQL. |
| 2 | **Many discussions per lesson** | Matches "ask questions or have general discussion". The old schema forced one thread per chapter with a unique constraint. |
| 3 | **Public read, sign-in to write** | Discussions get indexed and become a reason people find the site. Read endpoints stay open; only writes carry auth middleware. See section 8 for what this does to the threat model. |
| 4 | **v1 includes:** accepted answer + solved flag, admin moderation (pin/lock/delete), cross-lesson forum index | Chosen from a wider list. |
| 5 | **v1 excludes:** users editing or deleting their own posts | Deliberately not chosen. Admins can delete. Revisit later. |
| 6 | **URL shape `/forum/...`** | `/lessons/$lessonSlug` renders the full-screen workspace with no `<Outlet/>`, so a child route there needs the `lessons_.` escape-nesting convention. And the cross-lesson index needs a `/forum` prefix anyway. |
| 7 | **Store raw markdown, sanitize on render** | A sanitizer gap can never become stored XSS. Reuses the existing unified/remark/rehype pipeline. `rehype-raw` (already a dependency, used for lesson content) stays **off** for user content. Add `rehype-sanitize`. |
| 8 | **Thread kind: `question` or `discussion`** | Only a question can be marked solved, which makes the accepted-answer feature coherent, and the list can surface unanswered questions. |
| 9 | **Server-side prefetch via Effect Atom SSR** | See section 6. |
| 10 | **Middleware delegates all I/O to a service tag** (done, and it paid off: `middleware.test.ts` is an ordinary Node unit test over a hand-built `Request` and a stub gateway, with no server and no real session) | The `effect-http-api-auth` skill writes `AuthMiddlewareLive` as `Layer.succeed` calling `getAuth().api.getSession(...)` inline. That is a direct import, not a tag, so there is nothing to swap and the middleware cannot be unit tested. Use `Layer.effect`, yield the session tag while the layer is built, and export the decision logic as a standalone effect. |
| 11 | **No in-memory database anywhere in backend tests** | `HttpApiTest` (in-memory endpoint tests) is dropped. Anything that needs a database runs in workerd against real D1. |
| 12 | **Service tests run in Node over in-memory repository fakes** | Business rules keep a sub-second watch loop. The fakes are complete, compile-checked implementations of the port, so they cannot drift. |
| 13 | **Integration tests in workerd with real D1 are in scope** | The riskiest parts of this feature (cascade delete, batch atomicity, 403 on moderation, 400 on malformed input) exist nowhere else. Requires a test-only wrangler config, because there is none in the repo; see sections 4 and 9. |

### Naming

**Domain nouns: `Discussion` (top-level) and `Reply` (child).** One word each,
no qualifier needed, and both survive being a table name, an API group name, an
atom name and a component name.

**"Forum" names the place, never a thing.** So `src/features/forum/` and
`/forum/...`, but nothing is called "a forum".

**Ports are named for the capability, never the technology.** So
`DiscussionRepository`, not `DiscussionDb` and not `DiscussionStore`. The
`effect-data-access` skill calls out `ProductDb` as the wrong shape and says to
avoid `Store` for backend ports. This overrides the `db.ts` naming in the
`effect-http-api` skill's structure table and the `LinkStore` naming in the
testing course.

- **`Repository`**: read and write of our own domain data.
- **`Gateway`**: a wrapper over an external system.

**Every error type ends in `Error`.** `DiscussionNotFoundError`,
`DiscussionLockedError`, `NotAuthorError`, `DiscussionRepositoryError`. This
overrides the testing course's `SlugTaken` style.

**Port and adapter are separate files.** `discussion-repository.ts` holds the
tag and the row shapes and imports nothing platform-specific.
`discussion-repository-live.ts` imports drizzle and is the only file that
touches SQL for that sub-domain. Same reasoning as `middleware.ts` versus
`middleware-live.ts`.

**Component convention, confirmed by the user, taken from existing code:**
`<Noun><ConcreteUIThing>` where the second half is something you can point at on
screen. The house examples they approved:

```
LessonPanel   LessonsSheet   SchemaSheet   QueryResultsPanel
ResetDatabaseDialog   LoginCard   EmailOtpForm   GoogleSignInButton
ImpersonationBanner   UsersTable   WorkspaceHeader   MainNavbar
```

No `XList`, `XView`, `XSection`, `XContainer`. If a list of discussions renders
as a table it is `DiscussionsTable`; if as cards, `DiscussionCard`.

---

## 4. Target codebase facts

Verified against the repository. Re-check anything marked as a version.

### Framework and deploy

- **Framework:** TanStack Start + TanStack Router, flat file routes in `src/routes/`.
- **Deploy:** Alchemy v2 to a Cloudflare Worker. Stages `dev` and `prod`.
  `alchemy.run.ts` sets `nodejs_compat` and binds `DB`.
- **Local run:** `pnpm dev` (alchemy dev in workerd). Plain `vite dev` 500s every
  page because `cloudflare:workers` only exists inside the worker runtime.
- **There is no `wrangler.jsonc`.** Alchemy configures the worker in TypeScript
  and emits no wrangler config. `.alchemy/local/d1/` holds the dev database that
  the alchemy dev loop runs against.

### Database

- Cloudflare D1 via `drizzle-orm/d1`. Schema in
  `src/features/auth/server/schema.ts` using `drizzle-orm/sqlite-core`.
  Tables are **singular**: `user`, `session`, `account`, `verification`.
- **Migrations:** plain numbered SQL in `migrations/`, applied on deploy by the
  D1 resource in `alchemy.run.ts`. Present: `0001_better_auth.sql`,
  `0002_admin_plugin.sql`. Next file is `0003_forum.sql`.
- **D1 has no interactive transactions.** `db.batch([...])` is the atomic
  mechanism and it exists on the drizzle D1 driver. Anything that must commit
  together goes in one batch.
- **`drizzle-orm` is `^0.45.2`**, the same version as the testing course, so its
  war story applies exactly: Drizzle wraps driver errors in `DrizzleQueryError`
  whose top-level message is `Failed query: ...`, and the real
  `UNIQUE constraint failed` text lives on `error.cause`, sometimes two levels
  down. Any unique-violation detection must walk the cause chain.

### Auth

- Better Auth with `emailOTP`, Google, `admin()` plugin,
  `tanstackStartCookies()` last. Admin = `user.role === 'admin'`, assigned once
  at account creation from `ADMIN_EMAILS`.
- **Session:** read once in `__root.tsx` `beforeLoad` via the `getSession`
  server function, then read from route context everywhere else.
- **Route protection:** `src/routes/_authenticated.tsx` pathless layout already
  redirects to `/login` with `search.redirectTo = location.href`.
  The sign-in route is **`/login`**, not `/sign-in`.
- The `user` table columns matter for section 8:
  `id, name, email, emailVerified, image, createdAt, updatedAt, role, banned,
  banReason, banExpires`.

### TypeScript

- TypeScript `^7.0.2`, `strict`, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Both of the latter bite; write for them from the start.
- **`tsconfig.json` `include` is
  `["src", "types", "alchemy.run.ts", "vite.config.ts", "content-collections.ts"]`.**
  A root `test/` directory would not be part of the TypeScript project, so
  `tsc --noEmit` would silently skip every test file. Either co-locate tests
  under `src/` or add `test` to `include` before writing the first test.
- **There is no CI and no git hook.** `pnpm typecheck` runs only when someone
  runs it.
- Error handling elsewhere in the app: `better-result`
  (`Result.try` / `Result.tryPromise` + `TaggedError`). The forum uses Effect
  instead. Two idioms coexist; keep Effect inside the forum feature.

### Effect packages

**The pinned version is `4.0.0-rc.110`.** Effect v4 has left beta; `4.0.0-beta.107`
was the last beta and the `rc` track is now current. All four packages we need
publish in lockstep on that tag. Pin every one exactly, no caret.

- `effect@4.0.0-rc.110` is a **devDependency**, used only in `alchemy.run.ts`.
  Nothing in `src/` imports it. It moves to `dependencies`.
- **`@effect/platform-node` has been removed.** It was here for
  `NodeHttpServer.layerHttpServices`, which the build order step 2 spike proved
  cannot be used at all: importing `@effect/platform-node` under workerd fails
  at module load, because it pulls in `undici`, which needs `node:console`.
  The replacement is `HttpServer.layerServices` from `effect/unstable/http`.
  See section 14.
- **`@vitejs/plugin-react@^6.0.5` is already a devDependency.** Needed for
  browser-mode component tests.
- Verified published with matching peers:
  `@effect/atom-react@4.0.0-rc.110` (react `>=19.2.7 <20`, app is on `^19.2.8`)
  and `@effect/vitest@4.0.0-rc.110` (vitest `>=4.1.0 <5`).
- `pnpm typecheck` is clean on rc.110, so `alchemy.run.ts` survived the upgrade.
- One expected peer warning: `@hookform/resolvers` declares `effect@^3.10.3`.
  Harmless for our approach, because the `effect-react-hook-form` skill goes
  through `Schema.toStandardSchemaV1` and `standardSchemaResolver`, which is
  protocol-based and does not use the resolver's Effect-specific entry point.
- **Verified present at rc.110**, so nothing in this plan rests on an API that
  may not exist: `HttpApiTest.groups`, `effect/testing/TestClock`,
  `Hydration.dehydrate` / `hydrate`, `Atom.serializable`, `Atom.withServerValue`,
  `Atom.withReactivity`, `Atom.setIdleTTL`, `Atom.family`, `Atom.initialValue`,
  `AsyncResult.Schema`, `AtomRegistry.make` / `getResult` / `mount`, and
  `HydrationBoundary` exported from `@effect/atom-react`.

### Test infrastructure

**Built, in build order step 1.** Section 9 describes it; section 15 records
what was actually installed and the decisions taken while installing it.
Tests are **co-located under `src/`** and routed to a runner by filename
suffix, so `tsconfig.json` needed no `test` entry. It did need the three
vitest config files added to `include`, because `include` lists root config
files one by one.

### UI

- **UI components present** in `src/components/ui/`: `breadcrumb`, `button`,
  `card`, `dialog`, `input`, `input-otp`, `resizable`, `scroll-area`, `sheet`,
  `spinner`, `tabs`, `tooltip`. **Missing and needed:** `badge`, `avatar`,
  `textarea`, `dropdown-menu`, `separator`.
- **Design tokens:** `src/styles/app.css`. Fonts are Inter Variable and
  JetBrains Mono, bundled via `@fontsource-variable`. Accent is the navy scale
  (`--color-navy-600: oklch(0.5 0.127 248)`). `--radius: 0.45rem`.

---

## 5. Structure

Follows the `effect-http-api` skill's domain/sub-domain layout, with the
port/adapter split from `effect-data-access`.

```
src/features/forum/
├── index.ts                   barrel, matches lessons/ and practice-workspace/
│
├── api.ts                     HttpApi.make("forumApi") + .add per sub-domain   [shared]
├── layer.ts                   HttpApiBuilder.layer + every Layer.provide       [server]
├── web-handler.ts             HttpRouter.toWebHandler                          [server]
├── middleware.ts              CurrentUser, AuthMiddleware, AdminMiddleware     [shared, tags only]
├── middleware-live.ts         the *Live layers + the exported decision effects [server]
├── session-gateway.ts         SessionGateway tag: token -> session user        [shared, tag only]
├── session-gateway-live.ts    wraps the Better Auth instance                   [server]
├── atoms.ts                   ForumApi service + serializable read atoms +
│                              mutation atoms                                   [client]
├── http-client.ts             picks transport: fetch in browser,
│                              in-process on server                             [shared]
├── server-prefetch.ts         fresh AtomRegistry per request, dehydrate        [server]
│
├── db/
│   └── schema.ts              drizzle sqlite-core: discussion, discussionReply [server]
│
├── discussion/
│   ├── endpoints.ts               HttpApiEndpoint + HttpApiGroup("discussions") [shared]
│   ├── schemas.ts                 Schema.Struct request/response shapes         [shared]
│   ├── errors.ts                  Schema.TaggedError + httpApiStatus       [shared]
│   ├── rules.ts                   pure predicates, no service, no Layer         [shared]
│   ├── endpoint-handlers.ts       HttpApiBuilder.group                          [server]
│   ├── service.ts                 DiscussionService over the port               [server]
│   ├── discussion-repository.ts      the port: tag + row shapes, no driver      [shared]
│   └── discussion-repository-live.ts the adapter: the only file with SQL        [server]
│
├── reply/
│   └── (the same eight files, group "replies")
│
└── components/
    └── (names settled against the screens as they are built)
```

**The server/client split matters.** `api.ts` is imported by both the server
layer and the client atoms, so nothing reachable from `api.ts` may import
`cloudflare:workers`, drizzle, or the Better Auth instance. That is why the
middleware tags, the session gateway tag and every repository port are separate
files from their `-live` implementations. If a schema or error file ever imports
a repository adapter, the database client lands in the browser bundle.

**Make the compiler enforce that, rather than the reviewer.** TanStack Start
ships import protection, on by default, which denies a client-environment
import of anything marked server-only and fails the production build when it
happens. Every file tagged `[server]` in the tree above starts with:

```ts
import '@tanstack/react-start/server-only'
```

That keeps the `-live.ts` naming, which is the Effect idiom for a Layer
implementation, and still turns "nothing reachable from `api.ts` may import
drizzle" from a rule someone has to remember into a build error with the full
import chain printed. Section 14 has the details, including the one caveat:
the feature is marked experimental.

### Three tiers per sub-domain

From `effect-data-access`:

1. **`rules.ts`, pure functions.** No service, no Layer, tested directly. More
   of this feature lives here than is obvious: "only the author of a question
   can accept a reply", "a locked discussion rejects replies", "only
   `kind: 'question'` can be solved", and the offset arithmetic for a page are
   all predicates over a row and a user id. A rule that needs a store to test
   usually means the rule and the I/O were not separated yet.
2. **`service.ts`.** Acquires the port with `yield* DiscussionRepository`, calls
   the pure predicates, fails with domain errors, calls the port to write. No
   SQL. It decides what a missing row means, which is why the port returns
   `Row | null` rather than deciding for it.
3. **Port and adapter.** The adapter wraps every driver failure into
   `DiscussionRepositoryError` so a raw exception never escapes, and logs each
   failure with `Effect.tapError` plus `Effect.annotateLogs`. The service does
   not re-log what it propagates, because that prints two lines for one failure.

**A rule returns a reason, not a boolean.** `effect/Filter` is the right shape
for this: `Filter<Input, Pass, Fail>` is `(input) => Result<Pass, Fail>`, so it
narrows the passing value and carries a meaningful fail value. It is a protocol
Effect consumes directly, via `Effect.filterMap`, `filterMapOrFail`,
`filterMapOrElse`, `catchFilter` and `catchCauseFilter`. Two places it earns its
keep:

- **`Effect.filterMapOrFail` in a service**, replacing a stack of `if` guards
  that each call `Effect.fail`. The filter carries why it failed and
  `orFailWith` maps that reason to the typed domain error.
- **`Effect.catchFilter` for the unique-violation translation**, replacing
  `catchTag` plus a manual ternary. Non-matching errors stay in the channel.

Note that effective-dev's `apps/shared/forum/rules.ts` already hand-rolls this
idea, returning `{ allowed, reason, ... }`. `Filter` is its natural v4 shape.

**Read in full during step 6, and the shape is the only thing that transfers.**
Every actual rule in it is out of scope or belongs elsewhere:

| Old rule | Why it does not come across |
|---|---|
| `canParticipateInForum` | Forum-specific ban plus a daily post limit. Rate limiting is section 13 item 3, still undecided, and there is no forum-level ban column. |
| `evaluateCodeSnippetLimits` | Works on `bodyHtml`. Decision 7 stores raw markdown and never HTML, so it has nothing to parse. |
| `evaluateTitleLength` | Field validation, which section 8 puts in the hand-written payload schema, not in `rules.ts`. |
| `evaluateForumUsername` | The old project had forum-specific usernames. This one uses Better Auth's `user.name`. |
| `adjustWarningCount` | Warning counts and auto-ban. Decision 4 scopes moderation to pin, lock and delete. |

So `discussion/rules.ts` holds exactly the four the plan named: `canAcceptReply`,
`canReply`, and `pageOffset`, with `canAcceptReply` covering both the authorship
and the kind check.

Do not adopt it further than that. `effect/Predicate`'s boolean combinators are
the wrong tool here because booleans discard the reason, and its type guards
(`hasProperty`, `isString`) have no job in this feature: Schema at the HTTP
boundary is the check, and reaching for a guard means something got past it. The
one small win is `Array.filter(Predicate.isNotNull)`, which narrows the array
type properly under `noUncheckedIndexedAccess`. A generator with explicit `if`
guards stays the default; do not turn readable code point-free for its own sake.

Endpoint handlers convert `DiscussionRepositoryError` to a defect with
`Effect.die`, so a broken database becomes an opaque 500 rather than part of the
API contract. The one exception is the unique-violation path, where `create`
catches it, checks the cause chain, and re-fails with the domain conflict error.

### Routes

```
src/routes/
├── api/forum/$.ts                       mounts webHandler, mirrors api/auth/$.ts
├── forum.index.tsx                      /forum
├── forum.$lessonSlug.index.tsx          /forum/$lessonSlug
└── forum.$lessonSlug.$discussionId.tsx  /forum/$lessonSlug/$discussionId
```

### Two files the structure above did not anticipate

**`src/features/forum/errors.ts`**, at the feature root. Replying has to report
that a discussion is missing or locked, and the reply sub-domain cannot import
the discussion sub-domain. The alternative was a second vocabulary on the reply
side, so a client would see `DiscussionLockedError` from one endpoint and
something like `ThreadLockedError` from another for the same condition. Errors
that describe a discussion and are raised by more than one sub-domain live at
the root instead, next to `db/schema.ts` and for the same reason. Each
sub-domain re-exports them from its own `errors.ts`, so it still has one import
site. Errors only one sub-domain raises, and every `*RepositoryError`, stay
local.

**`src/features/forum/id-service.ts`** and its `-live`, also at the root.
Section 9 requires ids to come from a service so tests can assert exact values,
and both sub-domains need one.

**`reply/rules.ts` owns `canReply`, not `discussion/rules.ts`.** It is a rule
about whether a thread accepts replies, and only the reply service asks. It is
typed against `ParentDiscussion`, a minimal `{ id, locked }` shape the reply
port declares, rather than `DiscussionRow`, which would have pulled the other
sub-domain's types across the boundary. The reply adapter's `findParent`
projects exactly those two columns, so the reply side never reads the parent's
author, body or moderation state.

### Where the WHERE clause is repeated, and where it is not

`acceptReply` carries every condition in both places: `rules.ts` so the service
can name the reason, and the adapter's `WHERE` so nothing can change between
deciding and writing. Section 8 asks for that because the stake is
authorization.

Creating a reply deliberately does **not** repeat the lock check in a `WHERE`.
The race it would close is a reply landing on a discussion locked a moment
earlier, which costs one straggler post rather than an authorization failure,
and a conditional insert inside a batch is real complexity. If locking ever
needs to be exact, the insert becomes conditional the same way. The reasoning
is recorded next to `canReply` so it reads as a decision rather than an
oversight.

### Moderation is not its own sub-domain

Pin, lock and delete are more endpoints on the same resources, differing only in
who may call them. The `effect-http-api-auth` skill puts `.middleware()` on
individual endpoints, so public and admin endpoints live in one group:

```
discussions group
  GET    /discussions                public   list, filtered by lesson
  GET    /discussions/:id            public   one discussion
  POST   /discussions                auth     start one
  POST   /discussions/:id/accept     auth     author marks a reply as the answer
  POST   /discussions/:id/pin        admin
  POST   /discussions/:id/lock       admin
  DELETE /discussions/:id            admin
```

A separate `moderation/` folder would have to read and write both tables, which
breaks the rule that a sub-domain never imports another sub-domain.

### Files touched outside the feature

| File | Change |
|---|---|
| `package.json` | move `effect` to dependencies, add `@effect/atom-react`, `rehype-sanitize`; add the test devDependencies from section 9 and the three test scripts |
| `tsconfig.json` | add `test` to `include` if tests do not live under `src/` |
| `wrangler.test.jsonc` | new, test-only. See section 9 |
| `src/components/atom-registry-provider.tsx` | new. Providers live in `components/`, next to `CodeBlockPreloadProvider` |
| `src/routes/__root.tsx` | wrap `<Outlet/>` in `AtomRegistryProvider` |
| `src/features/practice-workspace/components/workspace-header.tsx` | add the Discuss entry point beside `SchemaSheet` and `LessonsSheet` |
| `migrations/0003_forum.sql` | the two new tables |
| `alchemy.run.ts` | **nothing.** D1 needs no new binding or secret |

---

## 6. SSR: prefetch on the server

Confirmed with the user: **do not fetch discussions in the browser.** The
`effect-atom-ssr` skill has a first-class path for this.

Mapping the skill (written for Next.js Server Components) onto TanStack Start:

| Skill (Next.js) | Here (TanStack Start) |
|---|---|
| `async` Server Component body | route `loader` |
| `await searchParams` + `Schema.decodeUnknownSync` | `validateSearch` on the route, as `login.tsx` already does |
| pass `dehydratedState` as a prop | `Route.useLoaderData()` |
| `<HydrationBoundary state={...}>` | identical, and confirmed exported by `@effect/atom-react` |

Two parts of the skill do **not** apply:

- **The "bridge URL-bound atoms" section is moot.** It exists because
  `Atom.searchParam` reads `window.location` and returns `Option.none()` on the
  server. TanStack Router already owns URL state and gives typed search params on
  both sides, so pass `page` and `q` as plain values into the atom family and
  never use `Atom.searchParam`. This removes the `Atom.withServerValue`
  memoization trap entirely.
- **Streaming (`encodeInitialAs: "promise"`) does not transfer.** It rides the
  React Flight stream, and the `Hydration` docs state the promise cannot be sent
  through JSON. TanStack Start loader data is JSON. The blocking prefetch is
  right here anyway.

### A route loader is not server-only

**This corrects the mapping table above.** TanStack Start route loaders are
isomorphic: they run on the server for the initial request and **again in the
browser on every client-side navigation**. A loader is not the equivalent of a
Server Component body, and treating it as one would build a fresh
`AtomRegistry` and dehydrate it inside the browser on every navigation, then
hand the result to `HydrationBoundary` to hydrate back. Wasteful, and it drags
the whole server prefetch path into the client bundle.

The fix is `createIsomorphicFn().server(...)` with no `.client()` half. It runs
the prefetch on the server, is a no-op returning `undefined` on the client, and
is **tree-shaken per bundle**, so the registry, the dehydrate call and the
in-process web handler never reach the browser at all:

```ts
const prefetchDiscussions = createIsomorphicFn().server(
  async ({ lessonSlug, page }: DiscussionsQuery) => {
    const registry = AtomRegistry.make()
    // ... getResult, Effect.exit, Hydration.dehydrate(registry)
  },
)
```

`createServerFn()` is the wrong tool here. It would work, but on a client-side
navigation it turns into a network round trip to fetch a dehydrated snapshot
that the client is about to hydrate, when the atom could simply have fetched
its own data.

### Per-page flow

```
GET /forum/how-postgresql-executes-sql?page=2      initial request
  │
  ├─ validateSearch     → { page: 2 }                      typed, defaulted
  ├─ loader (server)    → AtomRegistry.make()              fresh, never shared
  │                       getResult(..., suspendOnWaiting: true)
  │                       wrapped in Effect.exit           failures hydrate as Failure
  │                       Hydration.dehydrate(registry)
  ├─ SSR                → real HTML, crawlers see the discussions
  └─ client             → <HydrationBoundary state={loaderData}>
                          atoms read preloaded values, no refetch
                          after a reply posts, reactivity keys refetch client-side

client-side navigation to the same route
  │
  ├─ loader (browser)   → the isomorphic fn is a no-op, returns undefined
  └─ client             → no HydrationBoundary state, atoms fetch normally
```

### Read atom shape

```ts
Atom.family(([lessonSlug, page]) =>
  ForumApi.query("discussions", "getDiscussions", { query: { lessonSlug, page } })
    .pipe(
      Atom.serializable({
        key: `discussions:${lessonSlug}:${page}`,
        schema: AsyncResult.Schema({ success: ..., error: ... }),
      }),
      Atom.withReactivity([...]),
      Atom.setIdleTTL(Duration.minutes(5)),   // MUST come after withReactivity
    )
)
```

### Three traps to remember

0. **Timestamps are a hydration mismatch waiting to happen.** Every discussion
   and reply renders a date, and a relative one ("3 hours ago") or anything
   built from `Intl` or the local time zone renders differently on the server
   and in the browser. Either format it deterministically (fixed locale and
   UTC, decided on the server) or wrap it in `<ClientOnly>` with a stable
   fallback. This is a different axis from section 9's "no `Date.now()` in
   domain logic", which is about test determinism, not rendering.
1. **Pipe order.** `setIdleTTL` after `withReactivity`, always. `withReactivity`
   wraps via `Atom.transform`, which resets `idleTTL` to zero, and a zero TTL
   makes the registry hard-delete the node between React's render and its
   post-commit subscribe. The hydrated value is thrown away and a spinner
   appears where server data should have been.
2. **A fresh `AtomRegistry.make()` per request.** A shared registry leaks one
   reader's data into another's response.
3. **Serializable keys must match** between server and client exactly, or the
   preloaded entry silently goes unconsumed and the atom refetches.

### The transport question (settled, proved in build order step 3)

When an atom's Effect runs on the server, an `AtomHttpApi` query atom makes an
HTTP call, so the worker would fetch its own URL. Two things make this
manageable:

- **Reads are public**, so the server prefetch needs no cookies. The old
  project's `forumCookieHeaderAtom` is unnecessary here. Whether to show
  moderation controls comes from `context.session`, which the root route already
  resolves.
- **The transport can differ by environment.** `AtomHttpApi` takes `httpClient`
  as a `Layer`:

```
browser → FetchHttpClient.layer, hits /api/forum/*
server  → a layer that calls webHandler(request) in-process, no network
```

That is what `http-client.ts` is for, and it is proved. The whole swap is one
value:

```ts
const inProcessFetch: typeof globalThis.fetch = (input, init) =>
  forumWebHandler(new Request(input as URL | string, init))

export const InProcessHttpClient = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, inProcessFetch)),
)
```

`FetchHttpClient` reads its fetch implementation from a `Context.Reference`, so
overriding that reference reuses everything the shipped client already does with
request bodies, headers and the abort signal, instead of hand-writing a second
`HttpClient` from `HttpClient.make`.

The base URL only has to be absolute, because `new Request()` rejects a relative
one. Nothing listens on it. `http://forum.internal` is the placeholder used in
the spike.

Three things were verified under workerd, all green:

- a typed `HttpApiClient` drives the web handler with no network,
- a domain error round-trips: the handler fails with the error class, it crosses
  as a 409, and the generated client decodes it back into a real instance,
  which is the `HttpApiTest` test section 9 says must survive,
- `AtomHttpApi.Service` accepts the layer, and a query atom read through a fresh
  `AtomRegistry` returns the decoded value.

---

## 7. Schema

Singular table names, matching `user` / `session` / `account`.

```sql
CREATE TABLE "discussion" (
  "id"              TEXT PRIMARY KEY NOT NULL,
  "lessonSlug"      TEXT NOT NULL,
  "kind"            TEXT NOT NULL CHECK ("kind" IN ('question','discussion')),
  "title"           TEXT NOT NULL,
  "body"            TEXT NOT NULL,          -- raw markdown, never HTML
  "authorId"        TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "acceptedReplyId" TEXT,                   -- set only when kind = 'question'
  "pinned"          INTEGER NOT NULL DEFAULT 0,
  "locked"          INTEGER NOT NULL DEFAULT 0,
  "replyCount"      INTEGER NOT NULL DEFAULT 0 CHECK ("replyCount" >= 0),
  "createdAt"       INTEGER NOT NULL,
  "lastReplyAt"     INTEGER NOT NULL,
  CHECK ("acceptedReplyId" IS NULL OR "kind" = 'question')
);

CREATE INDEX "discussion_lesson_activity_idx"
  ON "discussion" ("lessonSlug", "pinned" DESC, "lastReplyAt" DESC, "id" DESC);
CREATE INDEX "discussion_activity_idx"
  ON "discussion" ("lastReplyAt" DESC, "id" DESC);
CREATE INDEX "discussion_author_idx"   ON "discussion" ("authorId");
```

`discussion_reply` mirrors it: `discussionId` referencing `discussion(id)` on
delete cascade, `authorId` referencing `user(id)` on delete cascade, `body`,
`createdAt`, plus an index on `("discussionId", "createdAt", "id")`.

### Why each choice

- The composite index matches the exact list query (lesson filter, pinned first,
  recent first) rather than indexing each column separately. The two indexes on
  `discussion` do not overlap by left prefix, so both earn their place.
- `kind` gets a `CHECK` because the set is genuinely closed. A `CHECK` passes on
  `NULL`, which is why `kind` is also `NOT NULL`.
- `authorId` is indexed because SQLite, like PostgreSQL, does not index the
  referencing side of a foreign key on its own, and the cascade delete needs it.
- **`id` is the pagination tiebreaker.** `ORDER BY pinned DESC, lastReplyAt DESC`
  alone is not a total order, so two discussions sharing a `lastReplyAt` can swap
  places between requests and appear on both page 1 and page 2, or on neither.
  The queries must order by `id` last and the indexes carry it.
- **`replyCount >= 0`** because the column is denormalized and written by two
  paths. A decrement bug should fail the write, not render "-1 replies".
- **`acceptedReplyId IS NULL OR kind = 'question'`** closes an impossible state.
  Without it the table permits a `kind: 'discussion'` row with an accepted
  answer. The domain type models the same thing as a tagged union.

### db.batch really is atomic, and the test for it has to be built carefully

`db.batch` being the atomic unit is the assumption the denormalized
`replyCount` rests on, so it is tested directly in
`db/batch-atomicity.workers.test.ts`: a batch whose **second** statement fails
rolls back the first. Without the batch the same two statements leave the first
one applied, which is what makes the test able to fail.

It has to be written that way round. The obvious version, inserting a duplicate
reply through the repository and checking the parent counter did not move,
passes whether or not a batch is used, because the insert is the first statement
and fails before the counter update is reached. That test is still worth having
as a regression guard, but it proves nothing about atomicity, and its comment
says so.

The same trap applies to the discussion list's `ORDER BY ... id DESC`. Removing
the tiebreaker changes no result, because `discussion_lesson_activity_idx`
already ends in `id DESC` and supplies that order itself. What can be falsified
is the query plan, so that is what
`discussion-repository-live.workers.test.ts` asserts: the plan reads the index
and contains no `USE TEMP B-TREE FOR ORDER BY`. Drop the index and it fails.

**The general lesson for the rest of this feature: after writing a test for a
property, break the property and confirm the test fails.** Three of the tests
written in step 5 passed against deliberately broken code on the first attempt.

### Two deliberate trade-offs

- `replyCount` is denormalized so the list page does not run a subquery per row.
  Every reply insert and delete must update it in **the same `db.batch([...])`**,
  because D1 has no interactive transactions.
- Storing raw markdown rather than HTML means a sanitizer gap can never become
  stored XSS.

### Verified, not assumed: the cascade fires

SQLite enforces foreign keys only when enabled on the connection, so this was
left open rather than assumed. **D1 has them on.** Both cascades are proved in
`src/features/forum/db/schema.workers.test.ts`: deleting a discussion removes
its replies, and deleting a user removes their discussions. Each asserts the
row exists first, so a seed that quietly failed cannot make the post-delete
assertion pass for the wrong reason.

Deletion can therefore rely on the cascade. The alternative that was on the
table, cleaning up child rows by hand inside the same `db.batch`, is not needed.

The same file pins the three CHECK constraints: `kind` outside the closed set,
a negative `replyCount`, and an `acceptedReplyId` on a discussion that is not a
question. All three reject at the database.

### One gap this schema leaves open

`acceptedReplyId` carries no foreign key, exactly as specified above. Nothing
stops it pointing at a reply that has been deleted. Today the only path that
deletes a single reply is admin moderation, and users cannot delete their own
posts (decision 5), so the window is small. It is still a real dangling
reference, and the cheap close is
`REFERENCES "discussion_reply"("id") ON DELETE SET NULL`, which would also make
a solved question quietly become unsolved when its accepted answer is removed.
Left as specified rather than changed unilaterally. See section 13.

---

## 8. Authorization and data exposure

This feature inverts the usual threat model, so this section exists to stop a
future session from applying the wrong defaults.

**Public read is the contract.** A signed-out visitor is meant to read every
discussion. So the standard object-level authorization checks do not apply to
the read paths, and adding ownership filters to reads would break the product.
What that does is move **data minimization from a secondary concern to the main
one**: every field that reaches a discussion response is readable by anyone,
including crawlers. There is no authenticated audience limiting the blast radius.

### The highest risk in this feature

The list page and the discussion page both show an author. `discussion.authorId`
references Better Auth's `user` table, which holds
`email, emailVerified, role, banned, banReason, banExpires`.

Drizzle's `db.select().from(discussion).innerJoin(user, ...)` with no explicit
projection returns **every column of both tables**. So the least-effort way to
write the author join publishes every forum participant's email address, admin
role, ban status and the free-text ban reason an admin wrote about them to
anonymous visitors.

Rules that follow:

- The author projection is explicit and narrow. `{ name, image }` and nothing
  else unless a specific screen proves it needs more.
- The API response schema for an author is its own type. A `user` row never
  becomes a response object.
- If the UI wants an admin badge, expose a derived `isAdmin` boolean, not the raw
  `role` column.
- Decide deliberately whether `authorId` appears in the response at all. Better
  Auth ids are opaque so the risk is low, but "the UI needs it" should be tested
  before it ships.

### Nothing bounds the size of a post

**Closed in step 9.** The numbers and how they are written are in section 16;
the reasoning below is what produced them.

Reading the old project's rules surfaced a gap this plan does not cover. It
capped code snippets per post, lines per snippet and characters per snippet.
None of that transfers as written, because it parsed HTML and this feature
stores markdown, but the reason it existed does transfer: **writes are public,
rate limiting is undecided (section 13 item 3), and neither `title` nor `body`
has a length limit anywhere in this plan.**

One signed-in account can therefore write arbitrarily large rows into D1, which
has its own row and database size ceilings, and every one of those rows is
served to anonymous readers on a public page.

The fix belongs in the hand-written payload schemas in step 9, as
`Schema.String` with a max length, so it comes back as a field-level 400
through the validation middleware rather than as a database error. Decide the
actual numbers there. This is listed with the other schema work rather than
treated as done.

One thing this does not close: it bounds a single row, not how many rows one
account writes. Rate limiting is still section 13 item 3.

### Client-supplied identity

`authorId` is never a field on any request payload. The actor always comes from
`CurrentUser`, which the middleware provides from the session. External input
identifies the target resource; it never establishes the caller's authority.

Payload schemas are written by hand, not derived from the row type with
`Partial` or a spread. `CreateDiscussionPayload` carries `lessonSlug`, `kind`,
`title`, `body` and nothing else. A client must not be able to set `pinned`,
`locked`, `replyCount`, `acceptedReplyId` or `createdAt`.

### Enforcement next to the operation

Ownership goes in the `WHERE` clause, not in a check every caller has to
remember. `acceptReply({ discussionId, replyId, authorId })` rather than
`getDiscussion(id)` followed by a separate comparison. This closes the window
between the check and the write at the same time.

Keep the pure predicate in `rules.ts` as well, so the service can return a
precise error instead of "zero rows affected". On a public forum the author is
already visible, so a precise "you are not the author" error leaks nothing.

### A ban ends write access immediately

`SessionUser` carries `banned`, and `resolveSessionUser` fails with 403 when it
is set. Better Auth stops a banned account from signing in, but a session issued
before the ban would otherwise keep working until it expired, which on a public
forum means a banned account keeps posting.

This was not in the plan. It is one branch and one test, and the alternative was
leaving a moderation hole open on the assumption that Better Auth revokes live
sessions, which was never checked.

`SessionUser` is `{ id, isAdmin, banned }` and nothing else. No `email`, and no
raw `role`: the admin check is derived in the gateway adapter, so the role column
never travels past the one file that reads it.

### CSRF on the forum's own endpoint

TanStack Start installs CSRF middleware automatically, but **only for server
functions**, and only while `src/start.ts` does not exist. The forum's writes
do not go through server functions. They go to `/api/forum/*`, a server route
mounting the Effect web handler, which that automatic middleware does not
cover.

What actually blocks a cross-site `POST /api/forum/discussions` today is Better
Auth's session cookie defaulting to `SameSite=Lax`, so the browser does not
attach it to a cross-site form post. That is a real protection, but it is
implicit, it lives in another feature's defaults, and it disappears the day
anyone sets `sameSite: 'none'`.

So the forum route carries the middleware explicitly. **The snippet below is
wrong as written**, and is kept only because the reasoning around it is right:
bare `createCsrfMiddleware()` validates every request it handles and 403s a
crawler's `GET`, which is the traffic decision 3 exists for. Section 16 has the
filtered version that ships.

```ts
export const Route = createFileRoute('/api/forum/$')({
  server: {
    middleware: [createCsrfMiddleware()],   // see section 16: needs a filter
    handlers: {
      GET: ({ request }) => forumWebHandler(request),
      POST: ({ request }) => forumWebHandler(request),
      DELETE: ({ request }) => forumWebHandler(request),
    },
  },
})
```

It checks `Sec-Fetch-Site`, `Origin` and `Referer`. Reads are public and
idempotent, so this costs nothing on the read path and closes the write path
without depending on a cookie default set elsewhere.

Note that if `src/start.ts` is ever added for anything else, the automatic CSRF
middleware for server functions stops installing and has to be registered by
hand. The app has `auth.functions.ts` today, so that would silently unprotect
existing server functions.

### Mutations reviewed separately from reads

Read permission does not imply write permission. Each admin endpoint carries
`AdminMiddleware`, not `AuthMiddleware`, and the two are interchangeable to the
compiler because both provide `CurrentUser`. So **a signed-in ordinary user
hitting each admin route and getting 403 is a required test, one per admin
endpoint**, not one for the group.

If delete ever becomes a soft delete, the hidden row must disappear from the
list query too. Hard delete as planned avoids the gap.

### What not to do

A repository method with no authorization check is correct when the exported
service operation is the boundary and the repository cannot be reached around
it. Do not sprinkle permission checks through the data layer. A public read path
with an explicit field projection is a correct design, not a gap.

---

## 9. Testing strategy

There is no test infrastructure today, so this is a build task before it is a
discipline. Source: the two course files in the repo root,
`effect-http-api-testing-course.md` and `effect-atom-tetsing.md`. Note the
HTTP course is pinned to `4.0.0-beta.93` while this repo is on `4.0.0-rc.110`;
chapter 8 of the atom course lists the deltas (`Context.Service`,
`Schema.Defect()` as a call, `withDecodingDefault(Effect.succeed(...))`,
`.exhaustive()`).

### Levels

| Where | Runtime | Config | What it covers |
|---|---|---|---|
| `rules.ts` | Node | unit | pure predicates, called directly, no Layer |
| services | Node | unit | business rules over compile-checked in-memory repository fakes |
| middleware | Node | unit | `HttpServerRequest.fromWeb(new Request(...))` plus a stub session gateway |
| repositories | workerd, real D1 | workers | cascade delete, the two CHECKs, `db.batch` atomicity, the composite index query, real constraint error shapes |
| full stack | workerd, real D1 | workers | the real worker entry with raw `Request`s: 201/400/401/403/404/409, typed error bodies, real Better Auth sessions |
| components | Chromium | browser | every `AsyncResult` branch, the reply form, the signed-out prompt, hydration |

**`HttpApiTest` is deliberately not used.** Its database would be an in-memory
Map, and the decision is that anything needing a database runs against real D1.

**One test it used to own must survive.** Its best test proved a typed error
round-trips: the handler fails with `DiscussionLockedError` and the generated
client decodes it back into a real instance. Raw JSON assertions prove the wire
format but not that decode path, and that path is exactly what `AtomHttpApi`
runs on the frontend. So add one workerd test that drives the generated
`HttpApiClient` against the real worker instead of raw `fetch`.

### Packages and configs

Add: `vitest` (>=4.1.0 <5), `@effect/vitest@4.0.0-rc.110`,
`@cloudflare/vitest-pool-workers`, `wrangler`, `@vitest/browser-playwright`,
`playwright`, `vitest-browser-react`. `@vitejs/plugin-react` is already
present. `@effect/platform-node` has been removed; see section 14.

Three configs, three scripts:

- `vitest.config.ts` (Node) for rules, services, middleware.
- `vitest.workers.config.ts` using the `cloudflareTest()` plugin (the Vitest 4
  API; `defineWorkersConfig` and `poolOptions.workers` are gone) with
  `readD1Migrations` pointed at `migrations/`.
- `vitest.browser.config.ts` with `provider: playwright()` imported as a
  function.

**The workers config needs a `wrangler.test.jsonc`**, because
`@cloudflare/vitest-pool-workers` reads bindings from a wrangler config and this
repo has none. It does not mirror the production worker. It needs a name, a
compatibility date, `nodejs_compat`, and one D1 binding called `DB`. Secrets go
through `ConfigProvider` and the schema through `readD1Migrations`. The only
drift risk is the compatibility date and flag list against `alchemy.run.ts`.

### Determinism requirements on source code

- **No `Date.now()` in domain logic.** `Clock.currentTimeMillis`, so `TestClock`
  can move time. This is also why timestamps are `INTEGER` epoch millis.
- **No inline `crypto.randomUUID()` where the value matters.** An `IdService`
  makes ids `discussion_1`, so tests assert exact values.
- Secrets through `Config`, never bare env access.

### Traps, each already paid for by someone

- **Middleware resolves at layer build time.** Provide it *into* the group layer
  with `Layer.provide` / `provideMerge`, never merged beside it. Symptom:
  `Service not found` at runtime with the layer visibly present.
- **`Layer.provide` hides, `Layer.provideMerge` exposes.** Use `provideMerge`
  when the test itself needs to reach the lower service.
- **Workers-pool storage isolation is per test FILE, not per test.** Every test
  seeds unique fixtures (a `seedCounter`), and any assertion on an aggregate
  flushes first, then seeds exactly what it counts.
- **`TestClock` does not reach inside promises.** Keep timing on the Effect side
  of the boundary.
- **Fakes refuse extra work.** Unused port methods are
  `Effect.die("not implemented")`, never quiet successes.
- **Mutation fakes get latency.** `Effect.delay("50 millis")` is what makes
  "the dialog closed before the server answered" a testable claim.
- **Component tests: one `RegistryProvider` per test**, `beforeEach` resets the
  URL, every `expect.element` / `expect.poll` is awaited, `render` is awaited.
- **Faked streams must match the chunking**, one chunk per page.
- **Exact matching pins** across all four Effect packages, no caret.

### Assignment rule

Test every behavior at the lowest level that can falsify it, and at exactly one
level, except the API contract, which is worth proving both as raw JSON and
through the typed client.

---

## 10. Current state of the work

Build order steps 1 to 9 are done. The API is assembled, mounted and
deployable: `pnpm build` is clean, the route is in `routeTree.gen.ts`, and no
forum module reaches the client bundle.

| Runner | Command | Tests |
|---|---|---|
| Node | `pnpm test` | 61 |
| workerd, real D1 | `pnpm test:workers` | 36 |
| Chromium | `pnpm test:browser` | 1 |

`pnpm typecheck` is clean.

Step 10 is next: the full-stack contract tests. Everything they need exists;
what they add is real Better Auth sessions, which is the one thing step 9's
tests could not reach. See section 16 for what that means concretely.

The throwaway spikes under `src/test-support/` are still present.
`web-handler.workers.test.ts` now covers the same transport for real, so
`spike-http-api.workers.test.ts` can go. `spike-in-process-client.workers.test.ts`
still holds the only proof of the typed-client decode path and of
`AtomHttpApi` over the in-process layer; keep it until step 10 replaces the
first and step 11 the second.

One design note worth keeping from the deleted preview route: solved and
accepted-answer states used one colour outside the existing palette, the navy
rotated to green at the same lightness and chroma, `oklch(0.5 0.127 155)`.
Everything else was existing tokens.

## 11. Skills to load before writing code

```
effect-http-api                     backend structure, endpoints, handlers, errors, assembly
effect-http-api-auth                CurrentUser, AuthMiddleware, AdminMiddleware
                                    (but see decision 10: its middleware shape is not testable)
effect-http-api-validation          field-level 400s instead of a blank Bad Request
effect-data-access                  three tiers, port and adapter, naming
effect-service                      Context.Service + Layer
effect-atom                         runtime, effect atoms, writable atoms, reactivity, TTL
effect-atom-http-api                AtomHttpApi.Service, query and mutation atoms
effect-atom-ssr                     serializable atoms, prefetch, dehydrate, hydrate
effect-atom-component-testing       registry per test, the three seams
effect-v4-apis                      when an Effect API behaves unexpectedly
vetting-typescript-repositories     read before writing, to avoid the usual mistakes
vetting-postgresql                  principles carry to SQLite; specifics do not
auditing-data-access-authorization  see section 8
tanstack-start-route-protection     auth guards, redirectTo
effect-react-hook-form              the app already uses react-hook-form + @hookform/resolvers
```

Plus the two course files in the repo root for testing:
`effect-http-api-testing-course.md`, `effect-atom-tetsing.md`.

Note on `vetting-postgresql`: the app's own store is D1/SQLite, so the
PostgreSQL-specific rules (MVCC, autovacuum, WAL, pooling, `NOT VALID`,
`CREATE INDEX CONCURRENTLY`) do not apply. The transferable parts are
constraints and integrity, index and access-path design, bounded and
deterministic pagination, parameterized SQL, and expand-contract migrations.
Its findings are already folded into section 7.

### When an Effect API is unclear, read the source

The project root contains `effect/`, a checkout of the Effect v4 monorepo
(effect-smol). **If an Effect API is unclear, read that source. Do not reach for
an API that looks plausible and do not invent a signature.**

| Need | Path |
|---|---|
| core: `Effect`, `Layer`, `Context`, `Clock`, `Schema`, `Config`, `ConfigProvider`, `Cause`, `Exit` | `effect/packages/effect/src/` |
| `HttpApi`, `HttpApiEndpoint`, `HttpApiGroup`, `HttpApiBuilder`, `HttpApiMiddleware`, `HttpApiClient`, `HttpApiTest` | `effect/packages/effect/src/unstable/httpapi/` |
| `Atom`, `AsyncResult`, `AtomHttpApi`, `AtomRegistry`, `Hydration` | `effect/packages/effect/src/unstable/reactivity/` |
| `HttpServerRequest`, `HttpRouter`, `FetchHttpClient` | `effect/packages/effect/src/unstable/http/` |
| `@effect/atom-react`: hooks, `HydrationBoundary`, `RegistryContext` | `effect/packages/atom/react/src/` |
| `it.effect` and the Effect test runners | `effect/packages/vitest/src/` |
| `HttpServer.layerServices` (replaces `NodeHttpServer.layerHttpServices`) | `effect/packages/effect/src/unstable/http/HttpServer.ts` |
| `TestClock` | `effect/packages/effect/src/testing/` |

The runnable tests are often clearer than the implementation:

```
effect/packages/effect/test/unstable/httpapi/*.test.ts
effect/packages/effect/test/reactivity/Atom.test.ts
effect/packages/effect/test/reactivity/AsyncResult.test.ts
effect/packages/effect/test/reactivity/AtomHttpApi.test.ts
effect/packages/atom/react/test/index.test.tsx
```

Written guides live at `effect/packages/effect/HTTPAPI.md`, `SCHEMA.md` and
`CONFIG.md`.

**One caveat that matters.** The checkout is `4.0.0-beta.99`; this repo installs
`4.0.0-rc.110`. That gap spans the end of the beta line and the whole rc line so
far, and v4 pre-releases carry breaking changes between them. So use the source
to understand how an API works and why, and treat
`node_modules/effect/dist/**/*.d.ts` as the authority on what a signature is
today. When the two disagree, the installed declarations win.

---

## 12. Build order

Everything above is decided. Start here.

1. ~~**Test infrastructure.**~~ **Done.** See section 15.
2. ~~**Spike: `NodeHttpServer.layerHttpServices` under workerd.**~~ **Done, and
   it failed.** `@effect/platform-node` cannot be imported under workerd at all.
   `HttpServer.layerServices` from `effect/unstable/http` replaces it and is
   proved working. See section 14.
3. ~~**Spike: the in-process `httpClient` layer** from section 6.~~ **Done, and
   it works.** See section 14. Steps 1 to 3 are complete; start at step 4.
4. ~~**`migrations/0003_forum.sql`** and `db/schema.ts`.~~ **Done**, with the
   constraint and cascade tests in `db/schema.workers.test.ts`.
5. ~~**Ports and adapters**, tested against real D1 in workerd.~~ **Discussion
   and reply repositories done**, 30 workerd tests. Cascade, CHECKs and batch
   atomicity all verified. Unique-violation translation is still to do, and it
   belongs with `create` in the service layer.
6. ~~**`rules.ts`** pure predicates, tested directly in Node.~~ **Done**,
   12 Node tests, every one falsified against a deliberately broken rule.
7. ~~**Services** over the ports, tested in Node with in-memory fakes.~~
   **Done.** `DiscussionService` and `ReplyService`, 25 Node tests, each rule
   falsified against a deliberately broken service.
8. ~~**`session-gateway.ts` and `middleware-live.ts`**, tested in Node with fake
   requests.~~ **Done.** 6 Node tests over hand-built Requests and a stub
   gateway, each decision falsified.
9. ~~**Endpoints, schemas, errors**, then `endpoint-handlers.ts`, `layer.ts`,
   `web-handler.ts`, and the `api/forum/$.ts` route.~~ **Done.** Both groups,
   both handler sets, the assembled layer, the web handler and the route with
   CSRF. 26 Node tests over the payload, response and query schemas and the
   validation transform, and 4 workerd tests driving the real web handler
   against real D1. Section 16 records what it changed.
10. **Full-stack workerd tests**, including the 403 per admin endpoint and the
    typed-client round trip.
11. **Atoms and the SSR prefetch**, then the routes.
12. **Components**, with browser tests.

---

## 13. Open items

Settled since this list was written:

- **Post size limits** (was the first thing step 9 had to decide). Title 3 to
  200, discussion body 1 to 20,000, reply body 1 to 10,000, `lessonSlug` at most
  100 and kebab-case, `page` 1 to 1,000. All in section 16.
- **Item 5, whether `authorId` is exposed.** It is. Responses carry the opaque
  Better Auth id and nothing else from the `user` table.

Still open:

1. **Whether `AtomRegistryProvider` wraps the whole app** in `__root.tsx` or only
   the forum routes. Whole app is simpler and harmless; confirm.
2. **Whether the session lookup is a `Gateway` or a `Repository`.** It wraps
   Better Auth's API rather than our own SQL, so `SessionGateway` is the current
   call. Change it if the session lookup ends up reading the `session` table
   directly.
3. **Rate limiting on writes.** The old project had a daily post limit. Better
   Auth's rate limiter is in-memory and only covers auth endpoints. Not decided.
   The size caps from step 9 bound one row; they do not bound how many rows.
4. **Notifications** when someone replies to your discussion. Out of v1 scope.
5. **The author join.** Section 8 specifies a narrow `{ name, image }`
   projection, and neither repository does it: both return rows carrying only
   `authorId`. Deferred deliberately, so the screens can prove which fields they
   need before the port grows. Until then no screen can show who wrote anything.
6. **Whether `acceptedReplyId` gets a foreign key.** Currently a bare `TEXT`
   column, so deleting the accepted reply leaves a dangling pointer and the
   question still reads as solved. `REFERENCES "discussion_reply"("id") ON
   DELETE SET NULL` closes it. Raised while writing the migration in step 4.
7. **The list response carries every discussion's full body.** A page is 20
   rows and a body can now be 20,000 characters, so the worst case is roughly
   400 KB of JSON on a public, crawled page. The fix is one change in two
   halves: narrow the adapter's `SELECT` and add a list-item schema without
   `body`. Doing only the schema half leaves the wasted read at D1. Raised in
   step 9 and left as specified rather than changed unilaterally.
8. **Nothing checks that a `lessonSlug` names a real lesson.** The schema bounds
   the shape, not the value, so any kebab-case string creates a discussion under
   a `/forum/<slug>` URL with no lesson behind it. On a public, indexed site
   that is a spam surface. The check needs the lesson registry, which the schema
   layer must not import, so it belongs in the service if it is wanted.

## 14. TanStack Start rules that shape this feature

Read from the framework docs after the plan was written. Each item here either
corrects something above or fills a gap it did not cover.

### The workerd HTTP layer (build order step 2)

`HttpApiBuilder.layer` needs four platform services, and the plan assumed they
would come from `NodeHttpServer.layerHttpServices`. They cannot. Importing
`@effect/platform-node` under workerd fails at module load, before any layer is
built, because it pulls in `undici`, which needs `node:console`:

```
TypeError: Cannot destructure property 'Console' of 'require(...)' as it is undefined.
 ❯ undici/lib/mock/pending-interceptors-formatter.js
```

That takes down every test in whatever file imports it, so it is not something a
try/catch can work around.

**`HttpServer.layerServices` from `effect/unstable/http` replaces it.** It is
`HttpPlatform.layer` plus `Path.layer` plus `Etag.layerWeak` over
`FileSystem.layerNoop({})`, with no Node dependency anywhere. Proved under
workerd: a one-endpoint `HttpApi` through `HttpRouter.toWebHandler`, called with
a raw `Request`, returns 200 and the right JSON.

The tradeoff being accepted is `FileSystem.layerNoop`: the API cannot serve
files from disk. The forum is a JSON API, so it does not care.

### The execution model

**A route loader runs on both the server and the client.** This is the single
most consequential rule for this feature, and section 6 originally assumed the
opposite. On the initial request a loader runs on the server; on every
client-side navigation it runs again in the browser. Anything that must stay on
the server goes in `createIsomorphicFn().server(...)`, `createServerOnlyFn()`,
or a `createServerFn()`, not in the loader body.

The related trap the docs call out by name: reading `process.env` or any secret
at module scope, or inside a loader, puts it in the client bundle. This app
reads config through `cloudflare:workers` `env` and Effect `Config` rather than
`process.env`, so it is not directly exposed, but the same reasoning applies to
the Better Auth instance and the drizzle client.

`ssr` on a route takes `true` (default), `'data-only'`, or `false`, and a child
route can only ever become **more** restrictive than its parent, never less.
The forum routes want the default `true`: the whole point of decision 3 is that
crawlers see the discussions.

### Import protection

On by default. It denies imports that cross an environment boundary, mocks them
with a warning in dev, and **fails the production build**. Two ways to mark a
file:

- **By name**: `**/*.server.*` is denied in the client environment,
  `**/*.client.*` in the server environment.
- **By marker**: `import '@tanstack/react-start/server-only'` as the first line.

The marker is what section 5 uses, because it keeps the `-live.ts` naming that
matches Effect's Layer convention while still getting the enforcement. Type-only
imports are ignored, since they are erased anyway, but a mixed
`import { type Row, getRow }` still counts.

Two caveats:

- **Marked experimental** in the docs. The user has accepted that. If it ever
  gets in the way, the fallback is the `.server.ts` naming convention, which is
  not experimental.
- It runs inside the `tanstackStart()` Vite plugin. None of the three vitest
  configs load that plugin, so it does not apply during tests, and a workerd
  test importing a repository adapter is fine. If it ever does need to apply,
  `ignoreImporters: ['**/*.test.ts']` is the escape hatch.

### Server routes

`/api/forum/$` is a server route, and its shape matches `api/auth/$.ts`
exactly: `createFileRoute` with a `server.handlers` object keyed by HTTP method,
each handler receiving `{ request, params, context }` and returning a
`Response`. The splat parameter is `params._splat`. The forum needs `GET`,
`POST` and `DELETE`.

Two rules worth knowing: each route may have only one handler file, and the
docs are explicit that server routes are for endpoints called from outside the
app, while server functions are for internal calls. The forum genuinely wants a
server route, because `AtomHttpApi` calls it as an HTTP API from the browser.

### Effect API names the plan got slightly wrong

Verified against `node_modules/effect/dist/**/*.d.ts` at `4.0.0-rc.110`, which
section 11 makes the authority when it disagrees with the checked-out source:

- **`Schema.TaggedError`**, not `Schema.TaggedErrorClass`. Signature is
  `Schema.TaggedError<Self>()(tag, fields, { httpApiStatus })`, so the status
  travels with the error definition. Corrected throughout this document.
- **`AtomRegistry.getResult(registry, atom, options)`** is a standalone dual
  function, not a method on the registry.
- **`HttpApiBuilder.layer`** requires
  `Etag.Generator | HttpRouter | FileSystem | HttpPlatform | Path`. That is the
  requirement `HttpServer.layerServices` exists to satisfy.

### The security line, stated by the framework

> Protect data in the endpoint that serves it. Server functions are API
> endpoints reachable independently of whichever route renders the calling UI.

and

> Route `beforeLoad` guards improve UX but aren't the data boundary.

This is section 8's position in the framework's own words. It is worth quoting
because it settles a question that would otherwise come up when the forum routes
get built: `_authenticated.tsx` redirecting a signed-out visitor to `/login` is
a nicety, not the thing that stops an unauthenticated write. The middleware on
the endpoint is.

### CSRF

Automatic for server functions, and only while `src/start.ts` does not exist.
Not automatic for server routes. See section 8.

### SEO, which decision 3 depends on

Decision 3 justifies public read partly because "discussions get indexed and
become a reason people find the site". The plan provides the SSR half of that
and nothing else. The rest is route-level and cheap:

- **`head`** on the discussion route, built from loader data: `title`,
  `description`, and Open Graph tags. Without it every forum page shares the
  root title.
- **Canonical link** on the paginated list route. `/forum/$lessonSlug?page=2`
  is duplicate-content-shaped, and section 7 already went to some trouble to
  make pagination a total order.
- **JSON-LD** via `head.scripts` with `type: 'application/ld+json'`.
  schema.org has `QAPage` and `DiscussionForumPosting`, which map onto the
  `kind: 'question' | 'discussion'` split and onto the accepted-answer feature
  almost exactly.
- **A dynamic sitemap**, as `src/routes/sitemap[.]xml.ts`. Forum content is
  created after build, so the build-time prerender crawler cannot find it. The
  `[.]` escapes the dot in the filename.

None of this is v1-blocking, but skipping it quietly means decision 3 is paying
a cost without collecting the benefit.

### Markdown

The framework's own markdown guide pipes `rehype-raw` with no sanitizer. That is
correct for the trusted authored content it is written for, and wrong for user
content. Decision 7 already says `rehype-raw` stays off for the forum and
`rehype-sanitize` goes on. **Keep the plan, not the framework example**, and do
not let the two pipelines get merged into one shared helper.

---

## 15. Test infrastructure as built

Build order step 1, done.

**Layout: co-located under `src/`, runner chosen by filename suffix.** Settled
with the user, closing the question section 4 left open. A test sits beside the
code it covers. Nothing test-shaped goes in `src/routes/`, because the route
generator scans that directory and would turn a test file into a route.

| Script | Config | Selects |
|---|---|---|
| `pnpm test` | `vitest.config.ts` | `src/**/*.test.{ts,tsx}` minus the other two |
| `pnpm test:workers` | `vitest.workers.config.ts` | `src/**/*.workers.test.ts` |
| `pnpm test:browser` | `vitest.browser.config.ts` | `src/**/*.browser.test.tsx` |

**`tsconfig.json` needed no `test` entry**, since `src` is already included. It
did need `vitest.config.ts`, `vitest.workers.config.ts` and
`vitest.browser.config.ts` added to `include`, because root config files are
listed one by one. Verified by planting a type error in a test file and
watching `tsc --noEmit` catch it.

**Versions.** `vitest` and `@vitest/browser-playwright` are pinned exactly to
`4.1.11`, not because of the Effect rule but because that peer dependency is an
exact match rather than a range. `@effect/vitest` is pinned to
`4.0.0-rc.110`. `@cloudflare/vitest-pool-workers@0.22` exposes `cloudflareTest()`
as a Vite plugin and `readD1Migrations` from the package root, confirming
section 9: `defineWorkersConfig` and `poolOptions.workers` are gone.

**`wrangler.test.jsonc` carries the compatibility date and flags**, set to
`2026-03-17` and `nodejs_compat` to match production. That date is alchemy's own
default, read out of `alchemy/lib/Cloudflare/Workers/Compatibility.js`, not
anything written in `alchemy.run.ts`. Re-check it after an alchemy upgrade.

Section 9's premise that the pool must read bindings from a wrangler config is
not quite right: bindings can be passed inline to `cloudflareTest()`. Both work
together, and the split used here is deliberate. Durable worker shape goes in
the file; test-only values go inline, which is also the only way to supply the
secrets the step 10 full-stack tests will need.

**`TEST_MIGRATIONS` is typed by one contained cast** in
`src/test-support/test-env.ts`, not by augmenting `Cloudflare.Env`. Augmenting
would put a test-only binding on the app's `Env` type everywhere and let feature
code type-check against something that is `undefined` in production.

**Browser mode needs `optimizeDeps.include`.** Otherwise Vite discovers and
optimizes a dependency on its first import mid-run, and that reload swaps the
module while a component is rendering, which breaks React context identity. It
surfaces as `useContext` crashes inside providers, with nothing pointing at
bundling. Extend the list as component tests pull in more packages; the Effect
Atom entries go in when `@effect/atom-react` is installed. The config also sets
a 1280x800 viewport, because browser mode otherwise defaults to a 414px phone
and this app is a desktop-first workspace. It deliberately does not load
`tanstackStart()`, whose SSR plugin fights the browser runner.

Several of these came from `/Users/hemanta/Documents/proselis`, a working
TanStack Start plus Cloudflare project with the same two-runner split. Worth
reading before inventing a test setup here.

---

## 16. What step 9 changed

The API as built, and the things that were not true or not known when sections
5 to 9 were written.

### Files added

```
src/features/forum/
├── api.ts                          HttpApi.make('forumApi'), prefixed /api/forum
├── layer.ts                        the whole assembly
├── web-handler.ts                  HttpRouter.toWebHandler
├── schemas.ts                      shared: PAGE_MAX, Page
├── validation.ts                   ValidationError, ValidationMiddleware, validationFields
├── validation.test.ts              3 Node tests
├── web-handler.workers.test.ts     4 workerd tests
├── discussion/
│   ├── endpoints.ts                group 'discussions', prefix /discussions
│   ├── endpoint-handlers.ts
│   ├── schemas.ts                  + schemas.test.ts, 17 Node tests
└── reply/
    ├── endpoints.ts                group 'replies', no prefix
    ├── endpoint-handlers.ts
    └── schemas.ts                  + schemas.test.ts, 10 Node tests

src/routes/api/forum/$.ts           GET, POST, DELETE, with CSRF
```

### The size limits, decided

| Field | Range | Why |
|---|---|---|
| discussion `title` | 3 to 200 | Long enough for a real question, short enough to render in a list |
| discussion `body` | 1 to 20,000 | ~20 KB worst-case row |
| reply `body` | 1 to 10,000 | Cheapest row to create in bulk, so half the allowance |
| `lessonSlug` | at most 100, kebab-case | Longest real slug today is 48 |
| `page` | 1 to 1,000 | See below |

Two things about how they are written:

- **`Schema.Trim` before the length check**, so a title of three spaces is
  refused rather than stored. `Trim` decodes first and the check runs on the
  trimmed value, which also means no row carries padding a reader cannot see.
- **`page` is bounded, and out-of-range is a 400 rather than a clamp.** Offset
  paging makes `OFFSET` grow with whatever number a stranger types and SQLite
  counts every row it skips, so the ceiling is part of the contract. Clamping
  would make the API lie about which page it returned.

### Field-level 400s carry one field at a time

The `effect-http-api-validation` skill works as written, with three corrections:

- `Schema.TaggedError`, not `Schema.TaggedErrorClass`, as section 14 already
  records.
- `@standard-schema/utils` is not installed and is not needed. `getDotPath` is
  four lines over the issue's `path`, whose segments are a key or a `{ key }`
  object.
- **`HttpApiBuilder` decodes the payload with the default parse options**, which
  stop at the first failure, and `layerSchemaErrorTransform` is handed the
  resulting `SchemaError` with no way to re-run the decode: its context carries
  only the endpoint and the group, and the body stream is spent. So a
  `ValidationError` carries **one** field per response even though its shape is
  a list. There is no schema-level annotation that changes this. A form should
  render what it is given rather than assume it has every problem with the
  submission.

`validationFields` is exported separately from the layer and handles the whole
issue set anyway, which is what makes it correct rather than accidentally right
for a set of one. It is tested by decoding a real payload with `errors: 'all'`.

### CSRF needs a filter, or it 403s every crawler

Section 8's snippet is `createCsrfMiddleware()` with no options. **Do not ship
that.** With no options it validates every request it handles, and rejects one
carrying no `Sec-Fetch-Site`, no `Origin` and no `Referer`, because
`allowRequestsWithoutOriginCheck` defaults to `false`. A crawler fetching a
discussion sends none of the three, so decision 3 would be paying for public
read and getting a 403.

What ships instead scopes validation to the methods that change something:

```ts
const csrf = createCsrfMiddleware({
  filter: ({ request }) => request.method !== 'GET' && request.method !== 'HEAD',
})
```

Reads are public and idempotent and there is nothing to forge on them, so this
loses nothing.

### Better Auth's allowedHosts reaches into the forum

`resolveSessionUser` calls the gateway on **every** write, including the one
that is about to answer 401. Better Auth builds its base URL from the request
`Host` and refuses any host outside `allowedHosts`, so a request with a
disallowed or missing `Host` makes the lookup throw, which
`Effect.catchTag('SessionGatewayError', Effect.die)` turns into a 500 rather
than a 401.

That is right for production, where the host is always real. It matters for
tests: `new Request('http://x/...')` carries **no** `Host` header at all, so
every workerd test that touches a write path must set one, and it must match a
pattern in `allowedHosts`. `localhost:8787` does; bare `localhost` does not,
because the pattern is `localhost:*`.

### Effect API corrections, on top of section 14's

- **`HttpApiEndpoint.delete`**, exported as `del as delete`. There is no
  `HttpApiEndpoint.del`.
- `HttpApiSchema.status(201)` piped onto a success schema gives a 201 with a
  body; `HttpApiSchema.NoContent` is the 204.
- `query:` accepts a whole `Schema.Struct`, not only a field record, and the
  string-tree codec composes with a `FiniteFromString` inside it.

### Shapes and paths as built

```
discussions group, prefix /discussions
  GET    /                    public   list, query: lessonSlug + page
  GET    /:id                 public   404 DiscussionNotFoundError
  POST   /                    auth     201
  POST   /:id/accept          auth     404 / 403 NotAuthor / 409 NotAQuestion / 409 Locked
  POST   /:id/pin             admin    payload { pinned }
  POST   /:id/lock            admin    payload { locked }
  DELETE /:id                 admin

replies group, no prefix
  GET    /discussions/:discussionId/replies   public
  POST   /discussions/:discussionId/replies   auth     201, 404 / 409 Locked
  DELETE /replies/:id                         admin
```

The replies group takes no prefix on purpose: a reply is read and written under
its discussion, but deleting one addresses the reply itself, and one prefix for
both would mean a delete path naming a discussion it does not need.

`ValidationMiddleware` goes on the **group** in both cases, because every
endpoint in each decodes something a client sent. The auth middlewares stay on
individual endpoints, which is what lets public, authenticated and admin
endpoints share one group.

The whole API is prefixed `/api/forum` in `api.ts` rather than in the route,
because `HttpRouter` matches on the request's own path and the route does not
strip anything.

### There is still no feature barrel

`src/routes/api/forum/$.ts` imports `forumWebHandler` from
`@/features/forum/web-handler`, not from an `index.ts`. Section 5's tree lists a
barrel, and it should exist once there are client-safe exports to put in it, but
a barrel that also re-exports `web-handler.ts` is precisely how the drizzle
client would reach the browser bundle. Build it around the atoms and components,
and keep the server-only modules out of it.

### What step 9's tests do not cover

Recorded because it looks like coverage and is not. The step 9 workerd tests
prove routing, handlers, services, repositories, the validation transform and
the 401 path, all against real D1. They were each falsified against deliberately
broken code, and one break was **not** caught:

**Swapping `AuthMiddleware` for `AdminMiddleware` on `create` keeps every test
green**, because both refuse a missing session identically. That is the
interchangeability section 8 predicted, and the only thing that separates them
is a signed-in ordinary user getting a 403. So section 8's "one 403 test per
admin endpoint" is not a nice-to-have in step 10, it is the only check on which
middleware each endpoint actually carries.

Still unproved after step 9, all needing a real session: 201 on create, 403 per
admin endpoint, 404 and 409 on the write paths, the payload 400 (an
unauthenticated bad payload is a 401, because auth runs first), and the typed
client round trip.
