import { expect, it } from 'vitest'

import type { FileSystem } from 'effect/FileSystem'
import type { Path } from 'effect/Path'
import * as Schema from 'effect/Schema'
import type { Etag, HttpPlatform } from 'effect/unstable/http'
import { HttpRouter, HttpServer } from 'effect/unstable/http'
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from 'effect/unstable/httpapi'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

// SPIKE, throwaway. Build order step 2.
//
// HttpApiBuilder.layer requires FileSystem, Path, HttpPlatform and
// Etag.Generator. The plan assumed those come from
// NodeHttpServer.layerHttpServices, which is unverified under workerd because
// it drags in the Node platform services. This runs the same one-endpoint API
// twice, once behind each candidate layer, so the choice rests on a result
// rather than an assumption.

const ping = HttpApiEndpoint.get('ping', '/ping', {
  success: Schema.Struct({ pong: Schema.Boolean }),
})

class SpikeGroup extends HttpApiGroup.make('spike').add(ping).prefix('/spike') {}

class SpikeApi extends HttpApi.make('spikeApi').add(SpikeGroup) {}

const SpikeHandlers = HttpApiBuilder.group(SpikeApi, 'spike', (handlers) =>
  handlers.handle('ping', () => Effect.succeed({ pong: true })),
)

const ApiLayer = HttpApiBuilder.layer(SpikeApi).pipe(Layer.provide(SpikeHandlers))

// The narrowest thing both candidates satisfy: HttpApiBuilder.layer's four
// platform requirements. NodeHttpServer.layerHttpServices provides more than
// this (crypto, stdio, terminal, child processes), which is the part that makes
// it a risk under workerd.
type PlatformServices =
  | FileSystem
  | Path
  | HttpPlatform.HttpPlatform
  | Etag.Generator

async function callPing(platformServices: Layer.Layer<PlatformServices>) {
  const { handler, dispose } = HttpRouter.toWebHandler(
    ApiLayer.pipe(Layer.provide(platformServices)),
    { disableLogger: true },
  )

  try {
    const response = await handler(new Request('http://spike.test/spike/ping'))
    return { status: response.status, body: await response.json() }
  } finally {
    await dispose()
  }
}

it('serves an HttpApi under workerd with HttpServer.layerServices', async () => {
  const result = await callPing(HttpServer.layerServices)

  expect(result.status).toBe(200)
  expect(result.body).toEqual({ pong: true })
})
