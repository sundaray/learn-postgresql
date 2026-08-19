import { PGlite } from '@electric-sql/pglite'
import { worker } from '@electric-sql/pglite/worker'
import { Result } from 'better-result'

import { encodePostgresError } from './postgres-error'
import { seedDatabase } from './seed'

// The bridge back to the tab serializes a rejection down to its message alone,
// so severity, detail, hint and the error position are lost unless they travel
// inside that message. Only the protocol calls can fail with a PostgreSQL
// error, so only those are wrapped.
const protocolMethods = new Set([
  'execProtocol',
  'execProtocolRaw',
  'execProtocolStream',
  'execProtocolRawStream',
])

function keepErrorFields(database: PGlite): PGlite {
  return new Proxy(database, {
    get(target, property) {
      // Methods stay bound to the instance itself: PGlite reads private fields
      // internally, which a proxy as `this` would reject.
      const value: unknown = Reflect.get(target, property, target)

      if (typeof value !== 'function') return value

      const method = value.bind(target) as (
        ...args: unknown[]
      ) => Promise<unknown>

      if (typeof property !== 'string' || !protocolMethods.has(property)) {
        return method
      }

      return async (...args: unknown[]) => {
        const outcome = await Result.tryPromise({
          try: () => method(...args),
          catch: (cause) => new Error(encodePostgresError(cause)),
        })

        // The bridge back to the tab reads a rejection, so the packed error
        // has to leave this call the same way it arrived.
        if (Result.isError(outcome)) {
          throw outcome.error
        }

        return outcome.value
      }
    },
  })
}

worker({
  async init(options) {
    const database = await PGlite.create({
      ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
      relaxedDurability: true,
    })

    // Without this the session picks up the machine's zone, and a timestamptz
    // reads differently in Mumbai than in New York. The lessons write their
    // cursors as UTC literals, so the session runs in UTC for every learner.
    await database.exec("SET TimeZone = 'UTC';")

    await seedDatabase(database)

    return keepErrorFields(database)
  },
})
