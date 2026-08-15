# Client Bundles, Server Bundles, and a 3 MiB Surprise

## Deploying a TanStack Start application to Cloudflare Workers with Alchemy v2

A TanStack Start application can look like one React project in the editor, but it does not become one JavaScript file in production. It becomes at least two programs:

```text
                         TanStack Start application
                                    |
                     +--------------+--------------+
                     |                             |
              browser/client build           SSR/server build
                 dist/client                   dist/server
                     |                             |
          Cloudflare static assets          Cloudflare Worker
          JS, CSS, fonts, WASM, data       request handling and SSR
```

That distinction becomes important when the application uses a large browser-only dependency. In this project, the dependency was [PGlite](https://pglite.dev/): PostgreSQL compiled to WebAssembly and run inside a browser Web Worker. Its WASM, database bootstrap data, and Worker code belong in the client assets. If they leak into the SSR bundle, Cloudflare may treat them as part of the Worker upload.

This article builds the deployment from first principles, reproduces the bundle leak, and shows the boundary that fixed it. It also covers a second, less obvious problem: a deployment plugin causing client assets to be emitted again by the SSR build.

The versions shown here are the versions tested by this project on August 15, 2026. Alchemy v2 is still beta software, so check the current beta tag and changelog before copying a version into another project.

## 1. Start with the execution model

TanStack Start routes and components are isomorphic by default. The same source module may participate in:

- server-side rendering on the first request;
- browser hydration after the HTML arrives; and
- later client-side navigation.

“This component only runs in the browser” is therefore not a safe assumption just because the component calls `useEffect`. The bundler reasons about imports, not only about when a React callback executes.

Consider this simplified module:

```ts
import { PGliteWorker } from '@electric-sql/pglite/worker'

export function createDatabase() {
  return new PGliteWorker(/* ... */)
}
```

If an isomorphic component imports `createDatabase`, its top-level dependency graph now reaches PGlite. Even if `createDatabase()` is called only inside `useEffect`, the server bundler has still seen the static import.

The useful mental model is:

```text
runtime control flow:  "Will this function execute on the server?"
bundle dependency graph: "Can the server build reach this import?"
```

You have to answer both questions.

TanStack’s documentation describes the underlying ideas in its [execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model), [environment functions](https://tanstack.com/start/latest/docs/framework/react/guide/environment-functions), and [import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection) guides.

## 2. Pin the infrastructure toolchain

Do not leave a beta infrastructure package on a floating range. First inspect the published tags:

```bash
pnpm info alchemy dist-tags --json
pnpm info alchemy versions --json
```

Then install an exact version. This project used:

```bash
pnpm add -D \
  alchemy@2.0.0-beta.72 \
  effect@4.0.0-beta.107 \
  @effect/platform-node@4.0.0-beta.107 \
  @cloudflare/workers-types@5.20260815.1
```

The resulting `package.json` deliberately contains exact versions for the beta infrastructure packages:

```json
{
  "scripts": {
    "plan:prod": "alchemy plan --stage prod --env-file .env",
    "deploy:prod": "alchemy deploy --stage prod --env-file .env"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "5.20260815.1",
    "@effect/platform-node": "4.0.0-beta.107",
    "alchemy": "2.0.0-beta.72",
    "effect": "4.0.0-beta.107"
  }
}
```

Pinning makes the deployment reproducible. Upgrading becomes an intentional operation: read the release notes, change the pin, run a plan, inspect the bundle, and deploy.

Two recent Alchemy improvements mattered here:

- `Cloudflare.state()` stores infrastructure state in Cloudflare instead of relying on a machine-local state file.
- Current `Cloudflare.Website.Vite` configuration supplies the Cloudflare Worker compatibility needed by the generated site, so this project did not need a separate Wrangler configuration just to add `nodejs_compat`.

The preceding beta also improved effect-valued Worker properties and asset handling. Those improvements were useful reasons to use the current beta instead of copying an older project’s commands and configuration.

## 3. Give Alchemy deployment credentials, not source-controlled secrets

Create a local `.env` file:

```dotenv
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

Ignore it:

```gitignore
.env
.alchemy/
```

Commit an empty `.env.example` instead:

```dotenv
# Deployment credentials read by Alchemy. Never place real values here.
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

The account ID identifies the Cloudflare account; it is not specific to one application. An API token can also be reused across projects when its account and permission scope allows that, although using narrowly scoped tokens limits the impact of a leak.

For this stack, the token needed account-scoped permissions for Workers Scripts, D1, Account Settings, and Secrets Store. `Cloudflare.state()` is why Secrets Store access is relevant. Secrets Store was available to free accounts when this deployment was completed, but it is a changing platform feature, so check the current [Secrets Store documentation](https://developers.cloudflare.com/secrets-store/manage-secrets/) and limits before relying on a particular quota.

These are deployment credentials. They should not be exposed to browser code or added to Vite variables prefixed with `VITE_`.

## 4. Define one production stack with D1

The project needs D1 for future authentication, but it does not need R2. Its `alchemy.run.ts` creates exactly those resources and rejects any stage other than `prod`:

```ts
import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as RemovalPolicy from 'alchemy/RemovalPolicy'
import { Stack } from 'alchemy/Stack'
import * as Effect from 'effect/Effect'

const appName = 'learn-postgresql'

const stage = Stack.useSync(({ stage }) => stage)

const productionStage = stage.pipe(
  Effect.flatMap((currentStage) =>
    currentStage === 'prod'
      ? Effect.succeed(currentStage)
      : Effect.die(
          new Error(`Only the "prod" Alchemy stage is supported`),
        ),
  ),
)

const resourcePrefix = productionStage.pipe(
  Effect.map((currentStage) => `${appName}-${currentStage}`),
)

export const Database = Cloudflare.D1.Database(
  'Database',
  resourcePrefix.pipe(
    Effect.map((prefix) => ({
      name: `${prefix}-db`,
      migrationsDir: './migrations',
    })),
  ),
).pipe(RemovalPolicy.retain())

export const Website = Cloudflare.Website.Vite(
  'Website',
  Effect.all({
    currentStage: productionStage,
    prefix: resourcePrefix,
  }).pipe(
    Effect.map(({ currentStage, prefix }) => ({
      name: prefix,
      env: {
        APP_STAGE: currentStage,
        DB: Database,
      },
    })),
  ),
)

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>

export default Alchemy.Stack(
  appName,
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const currentStage = yield* productionStage
    const database = yield* Database
    const website = yield* Website

    return {
      stage: currentStage,
      url: website.url.as<string>(),
      databaseName: database.databaseName,
    }
  }),
)
```

There are several small but important decisions in this file:

- The explicit stage check prevents an accidental `dev`, preview, or staging deployment from creating extra resources.
- The stage remains part of resource names, producing names such as `learn-postgresql-prod-db`.
- `RemovalPolicy.retain()` protects the database if the stack is later destroyed or replaced.
- `migrationsDir` keeps database schema changes attached to the resource lifecycle.
- The D1 resource itself becomes the `DB` Worker binding; an ID is not copied manually between files.
- No R2 bucket is provisioned merely because another application happened to use one.

Alchemy’s [TanStack Start guide](https://alchemy.run/cloudflare/frontend/tanstack-start), [D1 guide](https://alchemy.run/cloudflare/data/d1), [state-store guide](https://alchemy.run/state-store), and [resource lifecycle guide](https://alchemy.run/infrastructure-as-code/resource-lifecycle) are the relevant primary references.

## 5. Infer Worker environment types from the infrastructure

The infrastructure definition is the source of truth for bindings. Instead of separately maintaining an `Env` interface, derive it from the `Website` resource in `types/env.d.ts`:

```ts
/// <reference types="@cloudflare/workers-types" />

import type { WebsiteEnv } from '../alchemy.run.ts'

declare global {
  type Env = WebsiteEnv
}

declare module 'cloudflare:workers' {
  namespace Cloudflare {
    interface Env extends WebsiteEnv {}
  }
}

export {}
```

Make sure TypeScript includes this file and `alchemy.run.ts`:

```json
{
  "include": ["src", "types", "alchemy.run.ts", "vite.config.ts"]
}
```

Now a renamed or removed binding becomes a compile-time problem rather than a production surprise.

## 6. Find what entered the server bundle

The first deployment failed with Cloudflare’s Worker-size error. At the time, a Worker on the free plan had a 3 MiB compressed limit, while the paid limit was higher. Always consult the current [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) because quotas can change.

The output directory immediately explained the failure:

```bash
du -sh dist/client dist/server
du -ah dist/server | sort -hr | head -40
find dist/server -type f -iname '*pglite*' -print
```

The server output contained approximately:

```text
9.6 MiB  PGlite WebAssembly
6.0 MiB  PostgreSQL bootstrap data
616 KiB  browser Worker JavaScript
         syntax-highlighting assets
```

Those files were valid application assets, but they were in the wrong output. Raw and compressed sizes are different, so a directory larger than 3 MiB does not automatically prove the compressed Worker is over the limit. A rough local check is:

```bash
find dist/server -type f -exec gzip -c {} \; | wc -c
```

Treat that only as a diagnostic estimate. The deployment tool’s reported compressed upload size is authoritative.

## 7. Why wrapping a top-level import was not enough

An initial fix wrapped database creation in `createClientOnlyFn` but kept PGlite as a static import:

```ts
import { PGliteWorker } from '@electric-sql/pglite/worker'
import { createClientOnlyFn } from '@tanstack/react-start'

export const createDatabase = createClientOnlyFn(() => {
  return new PGliteWorker(/* ... */)
})
```

This solves the runtime question: TanStack knows the function is client-only. It does not necessarily solve the bundle question: the server build can still reach the top-level PGlite import.

A normal `pnpm build` happened to produce a small SSR output because dependency externalization and tree-shaking removed much of the graph. Alchemy’s Cloudflare build used stricter server bundling, including `resolve.noExternal`, and the browser dependency returned.

This is why testing only the framework’s default build can give false confidence. Test the same command and plugin chain used by production.

## 8. Make the client boundary structural

The robust fix used three layers together:

1. a `createClientOnlyFn` runtime boundary;
2. a dynamically imported client module; and
3. no browser-only top-level imports in the isomorphic wrapper.

The isomorphic wrapper is small:

```ts
// practice-database.ts
import { createClientOnlyFn } from '@tanstack/react-start'

export const createPracticeDatabase = createClientOnlyFn(async () => {
  const { createPracticeDatabaseClient } = await import(
    './practice-database.client'
  )

  return createPracticeDatabaseClient()
})

export type PracticeDatabase = Awaited<
  ReturnType<typeof createPracticeDatabase>
>
```

The heavyweight imports live only in the client module:

```ts
// practice-database.client.ts
import { live } from '@electric-sql/pglite/live'
import { PGliteWorker } from '@electric-sql/pglite/worker'

const databaseName = 'postgres-interview-lab-v2'

export function createPracticeDatabaseClient() {
  return new PGliteWorker(
    new Worker(new URL('./pglite-worker.ts', import.meta.url), {
      type: 'module',
      name: 'practice-workspace-pglite',
    }),
    {
      id: 'practice-workspace',
      dataDir: `idb://${databaseName}`,
      extensions: { live },
    },
  )
}
```

Because the dynamic import makes database creation asynchronous, consumers must await it. A minimal React hook looks like this:

```ts
import { useEffect, useState } from 'react'

import { createPracticeDatabase } from './practice-database'
import type { PracticeDatabase } from './practice-database'

export function usePracticeDatabase() {
  const [database, setDatabase] = useState<PracticeDatabase | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let active = true
    let openedDatabase: PracticeDatabase | null = null

    void (async () => {
      try {
        openedDatabase = await createPracticeDatabase()
        await openedDatabase.waitReady

        if (active) setDatabase(openedDatabase)
      } catch (cause) {
        if (active) setError(cause)
      }
    })()

    return () => {
      active = false
      if (openedDatabase) void openedDatabase.close()
    }
  }, [])

  return { database, error }
}
```

The cleanup matters. An async initializer may resolve after unmount, and a PGlite instance owns Worker and database resources that should be closed.

File names such as `.client.ts` communicate and enforce environment intent, while the dynamic import creates a real graph boundary. Either convention alone is easier to defeat accidentally.

## 9. A second leak: SSR emitted the client assets again

After fixing the source import graph, the exact Alchemy build still produced an unexpectedly large Worker upload. The browser assets were correctly present in `dist/client`, but the SSR environment was also emitting them.

Vite’s normal non-client behavior is `build.emitAssets: false`: the client build already owns static assets. In the tested Alchemy beta, the injected Cloudflare plugin enabled asset emission for the SSR environment. A top-level Vite setting was overwritten later during plugin configuration.

The fix was a Vite `configEnvironment` hook ordered after the other environment hooks:

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const keepClientAssetsOutOfSsr = {
  name: 'app:keep-client-assets-out-of-ssr',
  configEnvironment: {
    order: 'post',
    handler(name, config) {
      if (name === 'ssr') {
        config.build ??= {}
        config.build.emitAssets = false
      }
    },
  },
} satisfies Plugin

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  worker: {
    format: 'es',
  },
  plugins: [
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    keepClientAssetsOutOfSsr,
  ],
})
```

The important detail is `order: 'post'`. This is not just another static config value; it restores Vite’s non-client default after all plugins have contributed their environment configuration.

Do not add this hook blindly to every project. Use it only if bundle inspection shows the SSR environment duplicating client assets. A server module that genuinely imports a binary or WASM asset may need SSR asset emission. Recheck the behavior whenever Alchemy or Vite is upgraded. The controlling option is documented as [Vite `build.emitAssets`](https://vite.dev/config/build-options.html#build-emitassets).

In this application, the hook reduced the raw Worker upload reported by the deployment from roughly 30.57 MB to 13.59 MB. The raw number was still larger than 3 MiB, but the compressed upload fell below Cloudflare’s free-plan limit. The large PGlite files remained where they belonged: Cloudflare’s static asset store.

## 10. Plan and inspect the production build

Run the compiler and the ordinary application build first:

```bash
pnpm typecheck
pnpm build
```

Then run Alchemy’s production plan. This exercises the production integration and shows infrastructure changes without applying them:

```bash
pnpm plan:prod
```

After the plan, inspect the outputs again:

```bash
du -sh dist/client dist/server
du -ah dist/server | sort -hr | head -40
find dist/server -type f -iname '*pglite*' -print
```

The expectation is not “the application has no large assets.” A browser PostgreSQL implementation is inherently large. The expectation is:

```text
dist/client: contains PGlite WASM, data, and browser Worker assets
dist/server: does not duplicate those browser-only files
```

Once the plan is correct, deploy:

```bash
pnpm deploy:prod
```

Alchemy uploads static assets separately and uses content hashes, so later deployments can check existing assets and upload only changed files. It then deploys the Worker and records the resulting infrastructure state.

## 11. Verify behavior, not merely a successful command

A green deployment command proves that Cloudflare accepted an upload. It does not prove that every execution environment works.

For this kind of application, verify at least:

```text
[ ] The home page returns 200.
[ ] A server-rendered route returns 200.
[ ] A TanStack server function succeeds.
[ ] Client navigation works after hydration.
[ ] The PGlite client chunk returns 200.
[ ] The browser Worker script returns 200.
[ ] PGlite WASM and bootstrap data return 200 with usable MIME types.
[ ] The practice database reaches its ready state.
[ ] The browser console has no import, Worker, WASM, or hydration errors.
[ ] A second `pnpm plan:prod` reports no changes.
```

That last check is an idempotence test. If a plan immediately after deployment wants to replace or update resources again, investigate the unstable input before treating the stack as complete.

## 12. A reusable debugging sequence

When a Cloudflare Worker exceeds its size limit, use this order:

1. Run the exact production plan or build, not only the default Vite build.
2. List the largest files in the server output.
3. Classify each large file as server code, client code, or a genuine shared asset.
4. Trace browser-only files back to their first static import.
5. Move heavyweight browser imports behind a client-only dynamic boundary.
6. Rebuild and inspect again.
7. If files are still duplicated, inspect per-environment Vite configuration and plugin ordering.
8. Compare raw and compressed upload sizes instead of treating them as interchangeable.
9. Deploy, test both SSR and browser behavior, and run a no-op plan.

The deepest lesson is that source folders do not define deployment boundaries—module graphs do. An isomorphic full-stack framework makes it pleasant to share code, but every import still has a destination. Once you learn to ask “which runtime owns this dependency?”, bundle-size failures become much easier to explain and fix.

## Further reading

- [Alchemy: Getting Started](https://alchemy.run/getting-started/)
- [Alchemy: TanStack Start on Cloudflare](https://alchemy.run/cloudflare/frontend/tanstack-start)
- [Alchemy: Stages](https://alchemy.run/environments/stages)
- [TanStack Start: Execution Model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)
- [TanStack Start: Environment Functions](https://tanstack.com/start/latest/docs/framework/react/guide/environment-functions)
- [TanStack Start: Import Protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection)
- [TanStack Start: Selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr)
- [Vite: `build.emitAssets`](https://vite.dev/config/build-options.html#build-emitassets)
- [Cloudflare Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/)
