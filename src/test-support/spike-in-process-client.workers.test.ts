import { expect, it } from 'vitest'

import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { FetchHttpClient, HttpRouter, HttpServer } from 'effect/unstable/http'
import { AtomHttpApi, AtomRegistry } from 'effect/unstable/reactivity'
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
} from 'effect/unstable/httpapi'

// SPIKE, throwaway. Build order step 3.
//
// Section 6 needs the atoms' HTTP calls to take a different transport per
// environment: fetch in the browser, and in the worker a layer that calls the
// forum's own web handler in process rather than making the worker fetch its
// own URL over the network.
//
// The question this answers is whether that layer can be built at all, and
// whether a typed HttpApiClient driven through it still round-trips a response
// through the real encode and decode path.

// Note: the API is `Schema.TaggedError`, not `Schema.TaggedErrorClass` as the
// plan says. The status travels with the error definition.
class SpikeLockedError extends Schema.TaggedError<SpikeLockedError>()(
  'SpikeLockedError',
  {},
  { httpApiStatus: 409 },
) {}

const ping = HttpApiEndpoint.get('ping', '/ping', {
  success: Schema.Struct({ pong: Schema.Boolean }),
})

const locked = HttpApiEndpoint.get('locked', '/locked', {
  success: Schema.Struct({ pong: Schema.Boolean }),
  error: SpikeLockedError,
})

class SpikeGroup extends HttpApiGroup.make('spike')
  .add(ping)
  .add(locked)
  .prefix('/spike') {}

class SpikeApi extends HttpApi.make('spikeApi').add(SpikeGroup) {}

const SpikeHandlers = HttpApiBuilder.group(SpikeApi, 'spike', (handlers) =>
  handlers
    .handle('ping', () => Effect.succeed({ pong: true }))
    .handle('locked', () => Effect.fail(new SpikeLockedError())),
)

const { handler: webHandler } = HttpRouter.toWebHandler(
  HttpApiBuilder.layer(SpikeApi).pipe(
    Layer.provide(SpikeHandlers),
    Layer.provide(HttpServer.layerServices),
  ),
  { disableLogger: true },
)

// FetchHttpClient reads its fetch implementation from a Context.Reference, so
// the whole transport swap is that one value. Everything else the client does
// with a request body, the headers, and the abort signal stays the code that
// already ships, rather than a second copy written here.
let inProcessCallCount = 0

const inProcessFetch: typeof globalThis.fetch = (input, init) => {
  inProcessCallCount += 1
  return webHandler(new Request(input as URL | string, init))
}

const InProcessHttpClient = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, inProcessFetch)),
)

// The host never reaches a network. It only has to be absolute, because
// `new Request()` rejects a relative URL.
const baseUrl = 'http://forum.internal'

it('drives a typed client through the web handler with no network', async () => {
  const callsBefore = inProcessCallCount

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(SpikeApi, { baseUrl })
      return yield* client.spike.ping()
    }).pipe(Effect.provide(InProcessHttpClient)),
  )

  expect(result).toEqual({ pong: true })
  // Nothing listens on forum.internal, so a real network call could not have
  // returned. Counting the handler invocation says so directly rather than
  // leaving it to be inferred from the test passing.
  expect(inProcessCallCount).toBe(callsBefore + 1)
})

it('round-trips a typed error back into a real instance', async () => {
  const error = await Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(SpikeApi, { baseUrl })
      return yield* Effect.flip(client.spike.locked())
    }).pipe(Effect.provide(InProcessHttpClient)),
  )

  // Not a JSON assertion. The handler failed with a domain error, it crossed
  // the wire as a 409, and the generated client decoded it back into the class.
  // That decode path is the one AtomHttpApi runs on the frontend, and section 9
  // keeps this test precisely because raw JSON assertions do not cover it.
  expect(error).toBeInstanceOf(SpikeLockedError)
  expect(error._tag).toBe('SpikeLockedError')
})

class SpikeAtomApi extends AtomHttpApi.Service<SpikeAtomApi>()('SpikeAtomApi', {
  api: SpikeApi,
  httpClient: InProcessHttpClient,
  baseUrl,
}) {}

it('serves an AtomHttpApi query atom through the in-process transport', async () => {
  // A fresh registry per request is what section 6 requires, so building one
  // here mirrors what the route loader will do rather than sharing global state.
  const registry = AtomRegistry.make()
  const pingAtom = SpikeAtomApi.query('spike', 'ping', {})

  const result = await Effect.runPromise(
    AtomRegistry.getResult(registry, pingAtom, { suspendOnWaiting: true }),
  )

  expect(result).toEqual({ pong: true })
})
