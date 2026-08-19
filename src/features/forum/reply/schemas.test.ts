import { describe, expect, it } from 'vitest'

import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import {
  CreateReplyPayload,
  ListRepliesQuery,
  REPLY_BODY_MAX,
  ReplyResponse,
} from './schemas'

const decode = Schema.decodeUnknownResult(CreateReplyPayload)

const validPayload = { body: 'Run EXPLAIN ANALYZE and compare the row counts.' }

describe('CreateReplyPayload', () => {
  it('rejects a body longer than the maximum', () => {
    const result = decode({ body: 'a'.repeat(REPLY_BODY_MAX + 1) })

    expect(Result.isFailure(result)).toBe(true)
  })

  it('accepts a body exactly at the maximum', () => {
    const body = 'a'.repeat(REPLY_BODY_MAX)

    expect(decode({ body })).toStrictEqual(Result.succeed({ body }))
  })

  it('rejects a body that is empty or only whitespace', () => {
    const results = [decode({ body: '' }), decode({ body: '  \n ' })]

    expect(results.map(Result.isFailure)).toStrictEqual([true, true])
  })

  it('trims the body before storing it', () => {
    expect(decode({ body: `  ${validPayload.body}\n` })).toStrictEqual(
      Result.succeed(validPayload),
    )
  })

  // The parent comes from the path, and the author from CurrentUser. Neither is
  // something a client gets to name in the body.
  it('drops fields a client is not allowed to set', () => {
    const result = decode({
      ...validPayload,
      authorId: 'some-other-user',
      discussionId: 'discussion_other',
      createdAt: 0,
    })

    expect(result).toStrictEqual(Result.succeed(validPayload))
  })
})

describe('ReplyResponse', () => {
  const encode = Schema.encodeUnknownResult(ReplyResponse)

  const row = {
    id: 'reply_1',
    discussionId: 'discussion_1',
    body: 'Run EXPLAIN ANALYZE and compare the row counts.',
    authorId: 'user_1',
    createdAt: 1_700_000_000_000,
  }

  it('encodes a repository row unchanged', () => {
    expect(encode(row)).toStrictEqual(Result.succeed(row))
  })

  // Same defence as the discussion response: a widened row must not widen what
  // an anonymous reader sees.
  it('drops any column the row picked up that the response does not declare', () => {
    const widened = { ...row, email: 'reader@example.com', banned: true }

    expect(encode(widened)).toStrictEqual(Result.succeed(row))
  })
})

describe('ListRepliesQuery', () => {
  const decodeQuery = Schema.decodeUnknownResult(ListRepliesQuery)

  it('defaults to the first page when none is given', () => {
    expect(decodeQuery({})).toStrictEqual(Result.succeed({ page: 1 }))
  })

  it('reads a page number out of its string form', () => {
    expect(decodeQuery({ page: '4' })).toStrictEqual(
      Result.succeed({ page: 4 }),
    )
  })

  it('rejects a page that is not a whole number in range', () => {
    const results = [
      decodeQuery({ page: '0' }),
      decodeQuery({ page: '2.5' }),
      decodeQuery({ page: 'last' }),
    ]

    expect(results.map(Result.isFailure)).toStrictEqual([true, true, true])
  })
})
