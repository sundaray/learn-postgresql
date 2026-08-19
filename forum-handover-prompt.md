# Handover prompt for the forum feature

Paste everything below the line into a fresh session.

---

Read `/Users/hemanta/Documents/learn-postgresql/forum-feature-implementation.md`
in full before doing anything else. It is the authoritative design and handover
doc. Sections 14 and 15 were added during the build and record what was learned
against the framework and the test setup. Everything is settled except section
13.

We are building the forum feature, and we are doing it TDD.

## Where the work stands

Build order steps 1 to 8 are done and green. Do not redo them.

- **1. Test infrastructure.** Three vitest configs, three scripts,
  `wrangler.test.jsonc`, tests co-located under `src/` and routed to a runner by
  filename suffix. Section 15 has the details.
- **2. Spike, failed and replaced.** `NodeHttpServer.layerHttpServices` cannot be
  used: importing `@effect/platform-node` under workerd dies at module load on
  `undici` needing `node:console`. `HttpServer.layerServices` from
  `effect/unstable/http` replaces it. `@effect/platform-node` has been removed.
- **3. Spike, works.** The in-process `httpClient` layer is one value: override
  `FetchHttpClient.Fetch` with a function that calls the web handler. Proved with
  a typed client, a typed error round trip, and an `AtomHttpApi` query atom.
- **4.** `migrations/0003_forum.sql` and `db/schema.ts`.
- **5.** Both repositories, ports and adapters.
- **6.** `discussion/rules.ts` and `reply/rules.ts`.
- **7.** `DiscussionService` and `ReplyService` over in-memory fakes.
- **8.** `session-gateway.ts`, `middleware.ts` and `middleware-live.ts`.

Current counts, all passing, `pnpm typecheck` clean:

| Runner | Command | Tests |
|---|---|---|
| Node | `pnpm test` | 31 |
| workerd | `pnpm test:workers` | 32 |
| browser | `pnpm test:browser` | 1 |

Three throwaway files under `src/test-support/` are still present:
`boot.test.ts`, `boot.workers.test.ts`, `boot.browser.test.tsx`, plus
`spike-http-api.workers.test.ts` and `spike-in-process-client.workers.test.ts`.
The spikes still hold the only proof of the transport and the typed-error decode
path, so delete them only once step 9 and step 10 cover the same ground for
real.

## Start at build order step 9

Endpoints, schemas and errors, then `endpoint-handlers.ts`, `layer.ts`,
`web-handler.ts`, and the `api/forum/$.ts` route.

Three things are already decided and waiting for you there:

1. **Post size limits.** Nothing bounds `title` or `body` anywhere. Writes are
   public and rate limiting is undecided (section 13 item 3), so one account can
   write arbitrarily large rows into D1 and have them served to anonymous
   readers. The fix is a max length on the payload schema so it comes back as a
   field-level 400. **Ask the user for the numbers.**
2. **CSRF.** `/api/forum/$` is a server route, and TanStack Start's automatic
   CSRF middleware only covers server functions. Add `createCsrfMiddleware()` to
   the route. Section 8 has the reasoning.
3. **`api/forum/$.ts` needs `GET`, `POST` and `DELETE`**, mirroring
   `src/routes/api/auth/$.ts`.

Then step 10 (full-stack workerd tests, including a 403 per admin endpoint and
the typed-client round trip), step 11 (atoms and SSR prefetch), step 12
(components).

## How to work

From step 9 onward, one behaviour at a time:

- write the failing test first
- run it and show it fails for the right reason
- write the smallest code that makes it pass
- move on

**Then break the thing you just built and confirm a test catches it.** This is
not optional and it is not paranoia. Three tests written during step 5 passed
against deliberately broken code, for three different reasons: an index supplied
an ordering the query no longer asked for; a batch's first statement failed
before the second could run; a search-and-replace silently did not apply. Section
7 of the doc records this. Every rule and every service decision built since has
been falsified this way, and it has caught real gaps.

Section 9 of the doc says which runtime each kind of test belongs in. Do not put
database tests in Node, do not introduce an in-memory database, and do not use
`HttpApiTest`. Those are deliberate.

## Effect

Never guess an Effect API. The installed version is `4.0.0-rc.110` and
`node_modules/effect/dist/**/*.d.ts` is the authority. The v4 source is also
checked out at `./effect`, but it is `4.0.0-beta.99`, so when the two disagree
the installed declarations win. Section 11 maps where things live.

Better than both for worked examples: `node_modules/effect/ai-docs/src/` and
`node_modules/@effect/vitest/ai-docs/`. The httpapi fixtures under
`node_modules/effect/ai-docs/src/51_http-server/fixtures/` are the shape to
follow for endpoints, groups, middleware and errors.

Names the plan originally got wrong, already corrected in the doc but worth
knowing: it is `Schema.TaggedError`, not `Schema.TaggedErrorClass`, and
`AtomRegistry.getResult(registry, atom, options)` is a standalone dual function
rather than a method.

The skills listed in section 11 are still worth loading, but they are written in
v3 style in places. Check signatures against the installed declarations before
following them.

## Existing forum code

There is a complete older forum at `/Users/hemanta/Documents/effective-dev` on
branch `origin/forum`, readable with `git show origin/forum:<path>`. Section 2
says what is worth taking. Note that `apps/shared/forum/rules.ts` has already
been read in full and nothing in it transfers; section 5 has the table of why.

`/Users/hemanta/Documents/proselis` is a working TanStack Start plus Cloudflare
project with the same two-runner test split. It was the source of several
things in section 15 and is worth reading before inventing anything new about
tests.

## Reporting

Keep status terse. Report what was written in a line or two. No screenshots.
Stop and report at the end of each build order step, and raise anything that
contradicts the doc rather than quietly working around it.
