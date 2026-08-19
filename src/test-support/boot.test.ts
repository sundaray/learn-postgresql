import { assert, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'

// Proves the Node runner boots and that it.effect from @effect/vitest runs an
// Effect to completion. Delete once real rules and service tests exist.
it.effect('the node runner runs an effect', () =>
  Effect.gen(function* () {
    const sum = yield* Effect.succeed(1).pipe(Effect.map((one) => one + 1))
    assert.strictEqual(sum, 2)
  }),
)
