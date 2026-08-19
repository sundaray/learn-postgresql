import '@tanstack/react-start/server-only'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { IdService } from './id-service'

export const IdServiceLive = Layer.succeed(IdService, {
  generate: (prefix: string) =>
    Effect.sync(() => `${prefix}_${crypto.randomUUID()}`),
})
