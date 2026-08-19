import { describe, expect, it } from 'vitest'

import * as Result from 'effect/Result'

import type { DiscussionRow } from './discussion-repository'
import { canAcceptReply, pageOffset } from './rules'

// Pure predicates, called directly. No Layer, no database, no Effect runtime.
// A rule that needed a store to test would mean the rule and the I/O had not
// been separated yet.

const author = 'user_author'
const stranger = 'user_stranger'

function discussionRow(overrides: Partial<DiscussionRow> = {}): DiscussionRow {
  return {
    id: 'discussion_1',
    lessonSlug: 'how-postgresql-executes-sql',
    kind: 'question',
    title: 'Why does this plan use a seq scan',
    body: 'Body.',
    authorId: author,
    acceptedReplyId: null,
    pinned: false,
    locked: false,
    replyCount: 0,
    createdAt: 1_000,
    lastReplyAt: 1_000,
    ...overrides,
  }
}

describe('canAcceptReply', () => {
  it('passes for the author of an open question', () => {
    const result = canAcceptReply({ discussion: discussionRow(), actorId: author })

    expect(Result.isSuccess(result)).toBe(true)
  })

  it('refuses someone who is not the author', () => {
    const result = canAcceptReply({
      discussion: discussionRow(),
      actorId: stranger,
    })

    expect(result).toStrictEqual(Result.fail('not-author'))
  })

  it('refuses a discussion that is not a question', () => {
    const result = canAcceptReply({
      discussion: discussionRow({ kind: 'discussion' }),
      actorId: author,
    })

    expect(result).toStrictEqual(Result.fail('not-a-question'))
  })

  it('refuses a locked question', () => {
    const result = canAcceptReply({
      discussion: discussionRow({ locked: true }),
      actorId: author,
    })

    expect(result).toStrictEqual(Result.fail('locked'))
  })

  // Pinned so the reason a caller sees does not depend on evaluation order
  // changing later. Identity first, then the shape of the thing, then its state.
  it('reports not-author ahead of the other reasons', () => {
    const result = canAcceptReply({
      discussion: discussionRow({ kind: 'discussion', locked: true }),
      actorId: stranger,
    })

    expect(result).toStrictEqual(Result.fail('not-author'))
  })

  it('reports not-a-question ahead of locked', () => {
    const result = canAcceptReply({
      discussion: discussionRow({ kind: 'discussion', locked: true }),
      actorId: author,
    })

    expect(result).toStrictEqual(Result.fail('not-a-question'))
  })
})

describe('pageOffset', () => {
  it('starts the first page at zero', () => {
    expect(pageOffset({ page: 1, pageSize: 20 })).toBe(0)
  })

  it('advances by a full page each time', () => {
    expect(pageOffset({ page: 2, pageSize: 20 })).toBe(20)
    expect(pageOffset({ page: 3, pageSize: 20 })).toBe(40)
  })

  // Schema validates the search params at the HTTP boundary, but this is the
  // last line before the value reaches a LIMIT/OFFSET, and a negative offset is
  // a SQL error rather than an empty page.
  it('clamps a page below one to the first page', () => {
    expect(pageOffset({ page: 0, pageSize: 20 })).toBe(0)
    expect(pageOffset({ page: -5, pageSize: 20 })).toBe(0)
  })
})
