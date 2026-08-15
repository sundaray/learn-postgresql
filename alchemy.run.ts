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
          new Error(
            `Learn PostgreSQL only supports the "prod" Alchemy stage; received "${currentStage}".`,
          ),
        ),
  ),
)

const resourcePrefix = productionStage.pipe(
  Effect.map((currentStage) => `${appName}-${currentStage}`),
)

// Authentication will use this binding later. Keeping migrations attached to
// the resource means new numbered SQL files are applied during each deploy.
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
