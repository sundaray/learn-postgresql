import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

// Ids come from a service rather than an inline crypto.randomUUID() so tests
// can assert exact values. Section 9's determinism rule: nothing in domain logic
// invents a value the test cannot predict.
export class IdService extends Context.Service<
  IdService,
  {
    readonly generate: (prefix: string) => Effect.Effect<string>
  }
>()('IdService') {}
