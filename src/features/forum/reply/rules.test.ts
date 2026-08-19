import { describe, expect, it } from 'vitest'

import * as Result from 'effect/Result'

import { canReply } from './rules'

// Deliberately typed against the reply port's own ParentDiscussion shape rather
// than the discussion sub-domain's row. A sub-domain does not import another
// sub-domain, and this rule only ever needs to know whether the thread is open.

describe('canReply', () => {
  it('passes on an open discussion', () => {
    const parent = { id: 'discussion_1', locked: false }

    expect(canReply(parent)).toStrictEqual(Result.succeed(parent))
  })

  it('refuses a locked discussion', () => {
    expect(canReply({ id: 'discussion_1', locked: true })).toStrictEqual(
      Result.fail('locked'),
    )
  })
})
