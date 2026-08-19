import { describe, expect, it } from 'vitest'

import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import {
  CreateDiscussionPayload,
  DiscussionResponse,
  ListDiscussionsQuery,
  PAGE_MAX,
  DISCUSSION_BODY_MAX,
  DISCUSSION_TITLE_MAX,
  LESSON_SLUG_MAX,
} from './schemas'

const decode = Schema.decodeUnknownResult(CreateDiscussionPayload)

const validPayload = {
  lessonSlug: 'how-postgresql-executes-sql',
  kind: 'question',
  title: 'Why does the planner pick a sequential scan here?',
  body: 'The table has an index on `id` but EXPLAIN shows Seq Scan.',
}

describe('CreateDiscussionPayload', () => {
  it('rejects a title longer than the maximum', () => {
    const result = decode({
      ...validPayload,
      title: 'a'.repeat(DISCUSSION_TITLE_MAX + 1),
    })

    expect(Result.isFailure(result)).toBe(true)
  })

  it('accepts a title exactly at the maximum', () => {
    const title = 'a'.repeat(DISCUSSION_TITLE_MAX)
    const result = decode({ ...validPayload, title })

    expect(result).toStrictEqual(Result.succeed({ ...validPayload, title }))
  })

  it('rejects a body longer than the maximum', () => {
    const result = decode({
      ...validPayload,
      body: 'a'.repeat(DISCUSSION_BODY_MAX + 1),
    })

    expect(Result.isFailure(result)).toBe(true)
  })

  it('rejects a title that is only whitespace', () => {
    const result = decode({ ...validPayload, title: '   ' })

    expect(Result.isFailure(result)).toBe(true)
  })

  it('trims the title and body before storing them', () => {
    const result = decode({
      ...validPayload,
      title: `  ${validPayload.title}  `,
      body: `\n${validPayload.body}\n`,
    })

    expect(result).toStrictEqual(Result.succeed(validPayload))
  })

  // Section 8: external input identifies the target, it never establishes the
  // caller's authority or the row's moderation state. A client sending these
  // must not have them reach the service.
  it('drops fields a client is not allowed to set', () => {
    const result = decode({
      ...validPayload,
      authorId: 'some-other-user',
      pinned: true,
      locked: true,
      replyCount: 999,
      acceptedReplyId: 'reply_1',
      createdAt: 0,
    })

    expect(result).toStrictEqual(Result.succeed(validPayload))
  })

  it('rejects a kind outside the closed set', () => {
    const result = decode({ ...validPayload, kind: 'announcement' })

    expect(Result.isFailure(result)).toBe(true)
  })

  // lessonSlug is stored on the row and appears in the URL, so it is bounded
  // and shaped for the same reason title and body are.
  it('rejects a lesson slug that is not kebab-case', () => {
    const results = [
      decode({ ...validPayload, lessonSlug: 'How PostgreSQL Executes SQL' }),
      decode({ ...validPayload, lessonSlug: '../../etc/passwd' }),
      decode({ ...validPayload, lessonSlug: '-leading-hyphen' }),
      decode({ ...validPayload, lessonSlug: '' }),
    ]

    expect(results.map(Result.isFailure)).toStrictEqual([
      true,
      true,
      true,
      true,
    ])
  })

  it('rejects a lesson slug longer than the maximum', () => {
    const result = decode({
      ...validPayload,
      lessonSlug: 'a'.repeat(LESSON_SLUG_MAX + 1),
    })

    expect(Result.isFailure(result)).toBe(true)
  })

  it('accepts the real lesson slugs', () => {
    const slugs = [
      'how-postgresql-executes-sql',
      'keyset-pagination-with-multiple-sort-columns',
      'using-explain-analyze-to-measure-actual-execution',
    ]

    for (const lessonSlug of slugs) {
      expect(decode({ ...validPayload, lessonSlug })).toStrictEqual(
        Result.succeed({ ...validPayload, lessonSlug }),
      )
    }
  })
})

describe('DiscussionResponse', () => {
  const encode = Schema.encodeUnknownResult(DiscussionResponse)

  const row = {
    id: 'discussion_1',
    lessonSlug: 'how-postgresql-executes-sql',
    kind: 'question' as const,
    title: 'Why does the planner pick a sequential scan here?',
    body: 'The table has an index on `id` but EXPLAIN shows Seq Scan.',
    authorId: 'user_1',
    acceptedReplyId: null,
    pinned: false,
    locked: false,
    replyCount: 0,
    createdAt: 1_700_000_000_000,
    lastReplyAt: 1_700_000_000_000,
  }

  it('encodes a repository row unchanged', () => {
    expect(encode(row)).toStrictEqual(Result.succeed(row))
  })

  // Section 8's highest risk: discussion.authorId references Better Auth's user
  // table, which carries email, role, banned and banReason. If a join ever
  // widens the row, the response schema is what stops those columns reaching an
  // anonymous reader.
  it('drops any column the row picked up that the response does not declare', () => {
    const widened = {
      ...row,
      email: 'reader@example.com',
      role: 'admin',
      banned: true,
      banReason: 'spam',
    }

    expect(encode(widened)).toStrictEqual(Result.succeed(row))
  })
})

describe('ListDiscussionsQuery', () => {
  // The query string arrives as text, so this is where "page=2" becomes 2 and
  // where anything that is not a page number stops being the service's problem.
  const decodeQuery = Schema.decodeUnknownResult(ListDiscussionsQuery)

  const lessonSlug = 'how-postgresql-executes-sql'

  it('defaults to the first page when none is given', () => {
    expect(decodeQuery({ lessonSlug })).toStrictEqual(
      Result.succeed({ lessonSlug, page: 1 }),
    )
  })

  it('reads a page number out of its string form', () => {
    expect(decodeQuery({ lessonSlug, page: '3' })).toStrictEqual(
      Result.succeed({ lessonSlug, page: 3 }),
    )
  })

  it('rejects a page that is not a whole number above zero', () => {
    const results = [
      decodeQuery({ lessonSlug, page: '0' }),
      decodeQuery({ lessonSlug, page: '-1' }),
      decodeQuery({ lessonSlug, page: '1.5' }),
      decodeQuery({ lessonSlug, page: 'two' }),
    ]

    expect(results.map(Result.isFailure)).toStrictEqual([
      true,
      true,
      true,
      true,
    ])
  })

  // An unbounded page turns a public GET into a scan: OFFSET grows with the
  // number a stranger types, and SQLite counts every skipped row.
  it('rejects a page past the maximum', () => {
    expect(
      Result.isFailure(decodeQuery({ lessonSlug, page: String(PAGE_MAX + 1) })),
    ).toBe(true)
  })

  it('rejects a lesson slug that is not kebab-case', () => {
    expect(Result.isFailure(decodeQuery({ lessonSlug: '../../etc' }))).toBe(true)
  })
})
