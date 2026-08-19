import { describe, expect, it } from 'vitest'

import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { CreateDiscussionPayload } from './discussion/schemas'
import { validationFields } from './validation'

// errors: 'all' collects every failing field instead of stopping at the first.
// HttpApiBuilder decodes a payload without it, so in the running API a
// ValidationError carries one field at a time; validationFields is written for
// the whole set anyway, because that is what makes it correct rather than
// accidentally right for a set of one.
const decode = Schema.decodeUnknownResult(CreateDiscussionPayload, {
  errors: 'all',
})

const validPayload = {
  lessonSlug: 'how-postgresql-executes-sql',
  kind: 'question',
  title: 'Why does the planner pick a sequential scan here?',
  body: 'The table has an index on `id` but EXPLAIN shows Seq Scan.',
}

// The framework rejects a bad payload with an empty 400 on its own. This is the
// part that turns the decode failure into something a form can put next to the
// input that caused it.
function fieldsFor(input: unknown) {
  const result = decode(input)

  if (Result.isSuccess(result)) {
    throw new Error('expected the payload to be rejected')
  }

  return validationFields(result.failure)
}

describe('validationFields', () => {
  it('names the field that failed', () => {
    const fields = fieldsFor({ ...validPayload, title: 'ab' })

    expect(fields.map((entry) => entry.field)).toStrictEqual(['title'])
    expect(fields[0]?.message).toEqual(expect.any(String))
    expect(fields[0]?.message.length).toBeGreaterThan(0)
  })

  it('reports every failing field when the decoder collects them all', () => {
    const fields = fieldsFor({
      ...validPayload,
      title: '',
      body: '',
      kind: 'announcement',
    })

    expect([...fields.map((entry) => entry.field)].sort()).toStrictEqual([
      'body',
      'kind',
      'title',
    ])
  })

  it('reports a missing field under its own name', () => {
    const { title: _title, ...withoutTitle } = validPayload
    const fields = fieldsFor(withoutTitle)

    expect(fields.map((entry) => entry.field)).toStrictEqual(['title'])
  })
})
