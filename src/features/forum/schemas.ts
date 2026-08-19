import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

// Schema pieces more than one sub-domain needs. They live here rather than in a
// sub-domain for the same reason the shared errors do: a sub-domain never
// imports another sub-domain, and a second copy of a page schema is a second
// place for the ceiling to drift.

// Offset paging means OFFSET grows with whatever number a stranger types, and
// SQLite counts every row it skips. Reads are public, so the ceiling is part of
// the API contract rather than something the service is trusted to clamp.
export const PAGE_MAX = 1_000

// Query parameters arrive as strings, so the page is parsed here and a service
// only ever sees a whole number in range. A page outside it is a 400, not a
// clamp: silently serving page 1 for page 0 would make the API lie about which
// page it returned.
export const Page = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: PAGE_MAX }),
).pipe(Schema.withDecodingDefault(Effect.succeed('1')))
