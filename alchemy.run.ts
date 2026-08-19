import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as RemovalPolicy from 'alchemy/RemovalPolicy'
import { Stack } from 'alchemy/Stack'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'

const appName = 'learn-postgresql'

// Config reads resolve through the ConfigProvider the Alchemy CLI gives the
// stack program, which layers --env-file over the process env. A missing or
// blank key fails the deploy, so an unset secret can never reach Cloudflare as
// an empty string and surface later as an unexplained auth failure.
const requiredSecret = (name: string) => Config.redacted(name)

const requiredString = (name: string) => Config.nonEmptyString(name)

// The two stages this stack knows how to build. "prod" is the deployed site.
// "dev" is the local `alchemy dev` loop: the worker runs on localhost inside
// workerd, so the auth code can read its D1 binding and its secrets the same
// way it does in production. Plain `vite dev` cannot do that, because
// `cloudflare:workers` only exists inside the worker runtime.
const supportedStages = ['prod', 'dev'] as const

type SupportedStage = (typeof supportedStages)[number]

function isSupportedStage(value: string): value is SupportedStage {
  return (supportedStages as readonly string[]).includes(value)
}

const stage = Stack.useSync(({ stage }) => stage)
const supportedStage = stage.pipe(
  Effect.flatMap((currentStage) =>
    isSupportedStage(currentStage)
      ? Effect.succeed(currentStage)
      : Effect.die(
          new Error(
            `Learn PostgreSQL supports the "prod" and "dev" Alchemy stages; received "${currentStage}".`,
          ),
        ),
  ),
)

// Every resource is named per stage, so the dev loop gets its own D1 database
// and never reads or writes the production one.
const resourcePrefix = supportedStage.pipe(
  Effect.map((currentStage) => `${appName}-${currentStage}`),
)

// Holds the Better Auth tables (user, session, account, verification). Keeping
// migrations attached to the resource means new numbered SQL files are applied
// during each deploy.
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
    currentStage: supportedStage,
    prefix: resourcePrefix,
  }).pipe(
    Effect.map(({ currentStage, prefix }) => ({
      name: prefix,
      compatibility: {
        // Better Auth reads its secret and signs cookies through Node APIs that
        // Workers only expose with this flag on.
        flags: ['nodejs_compat'],
      },
      env: {
        APP_STAGE: currentStage,
        DB: Database,
        BETTER_AUTH_SECRET: requiredSecret('BETTER_AUTH_SECRET'),
        BETTER_AUTH_URL: requiredString('BETTER_AUTH_URL'),
        // Legitimately optional: an empty list means no admin accounts.
        ADMIN_EMAILS: Config.string('ADMIN_EMAILS').pipe(Config.withDefault('')),
        GOOGLE_CLIENT_ID: requiredSecret('GOOGLE_CLIENT_ID'),
        GOOGLE_CLIENT_SECRET: requiredSecret('GOOGLE_CLIENT_SECRET'),
        // Amazon SES sends the one-time login codes.
        AWS_REGION: requiredString('AWS_REGION'),
        AWS_ACCESS_KEY_ID: requiredSecret('AWS_ACCESS_KEY_ID'),
        AWS_SECRET_ACCESS_KEY: requiredSecret('AWS_SECRET_ACCESS_KEY'),
        SES_FROM_EMAIL: requiredString('SES_FROM_EMAIL'),
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
    const currentStage = yield* supportedStage
    const database = yield* Database
    const website = yield* Website

    return {
      stage: currentStage,
      url: website.url.as<string>(),
      databaseName: database.databaseName,
    }
  }),
)
