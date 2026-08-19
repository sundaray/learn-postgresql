import type { LessonPlan } from '../../model/lesson-plan.types'

export const choosingBetweenOffsetAndKeysetPaginationLesson = {
  id: 'postgresql-10-choosing-between-offset-and-keyset-pagination',
  slug: 'choosing-between-offset-and-keyset-pagination',
  order: 10,
  title: 'Choosing Between Offset and Keyset Pagination',
  category: 'Pagination',
  introduction: [
    'Offset and keyset pagination both retrieve a limited portion of an ordered result, but they identify the starting position in different ways.',
    'Offset pagination counts rows from the beginning. Keyset pagination starts after or before values taken from a known boundary row.',
    'The appropriate choice depends on the size of the result, the navigation interface, the required ordering, and how the data changes while users navigate.',
  ],
  sections: [
    {
      title: 'When Offset Pagination Fits',
      content: [
        {
          type: 'paragraph',
          text: 'Offset pagination is often appropriate when:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                'The result set is small or users rarely navigate to deep pages.',
              ],
            },
            {
              paragraphs: [
                'The interface must allow users to jump directly to a particular page number.',
              ],
            },
            {
              paragraphs: [
                'Implementation simplicity is more important than maintaining similar performance at every depth.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Administrative tables, small search results, and reports with a limited number of pages can all be reasonable uses of `LIMIT` and `OFFSET`.',
        },
      ],
    },
    {
      title: 'When Keyset Pagination Fits',
      content: [
        {
          type: 'paragraph',
          text: 'Keyset pagination is often appropriate when:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                'The result could contain a very large number of rows.',
              ],
            },
            {
              paragraphs: [
                'Users navigate sequentially with next, previous, or load-more actions.',
              ],
            },
            {
              paragraphs: [
                'Deep-page performance needs to remain relatively stable.',
              ],
            },
            {
              paragraphs: [
                'The query has a deterministic order that can be supported by a suitable index.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Activity feeds, event histories, large API collections, and infinite-scroll interfaces commonly fit this model.',
        },
      ],
    },
    {
      title: 'What Happens When Data Changes',
      content: [
        {
          type: 'paragraph',
          text: "Under PostgreSQL's default `READ COMMITTED` isolation level, separate page queries can see different snapshots of the database. Rows may be inserted, deleted, or updated between requests.",
        },
        {
          type: 'paragraph',
          text: 'With offset pagination, a change before the current offset can shift the positions of later rows. A row may then appear on two pages or be skipped as the application moves from one page to another.',
        },
        {
          type: 'paragraph',
          text: "Keyset pagination doesn't depend on those relative row positions. New or deleted rows before the cursor therefore don't shift the boundary in the way they do with an offset.",
        },
        {
          type: 'paragraph',
          text: "However, keyset pagination doesn't create a frozen view of the complete result. An update to an ordering value can move a row across the cursor, and rows inserted on either side of the cursor may or may not appear during the remaining navigation.",
        },
        {
          type: 'paragraph',
          text: "If an application needs every page to represent one unchanged database snapshot, pagination alone isn't enough. The application must make a separate consistency decision, such as using an appropriate transaction or materializing the result.",
        },
      ],
    },
    {
      title: 'Indexes Must Match the Query',
      content: [
        {
          type: 'paragraph',
          text: 'Keyset pagination is efficient only when PostgreSQL has a useful way to locate the cursor boundary and produce rows in the requested order.',
        },
        {
          type: 'paragraph',
          text: 'The index design must take the complete query into account:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                'Columns used by fixed filter conditions.',
              ],
            },
            {
              paragraphs: ['Columns used by `ORDER BY`.'],
            },
            {
              paragraphs: [
                'The unique tie-breaker used to make the ordering deterministic.',
              ],
            },
            {
              paragraphs: [
                'The ascending or descending directions required by the query.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'A keyset condition without a suitable index can still require PostgreSQL to scan or sort a large amount of data. `EXPLAIN ANALYZE` should be used to verify the actual plan rather than assuming the cursor makes the query efficient.',
        },
      ],
    },
    {
      title: 'Choosing and Validating the Page Size',
      content: [
        {
          type: 'paragraph',
          text: 'Whether an application uses offset or keyset pagination, it should define a reasonable default page size and a maximum page size.',
        },
        {
          type: 'paragraph',
          text: 'Without a maximum, a client could request a very large `LIMIT` and defeat the purpose of dividing the result into manageable pages. The server should validate the requested value before supplying it to the query.',
        },
        {
          type: 'paragraph',
          text: 'An application can request one more row than it plans to return to determine whether another page exists. For a displayed page size of 10:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
WHERE id > 90000
ORDER BY id
LIMIT 11;`,
        },
        {
          type: 'paragraph',
          text: 'If the query returns 11 rows, the application returns the first 10 and uses the extra row only as evidence that a next page exists. If it returns 10 or fewer, the application has reached the end of the result.',
        },
        {
          type: 'paragraph',
          text: 'This avoids running an exact `count(*)` query merely to decide whether to display a next-page action.',
        },
      ],
    },
    {
      title: 'Page Counts and Direct Jumps',
      content: [
        {
          type: 'paragraph',
          text: 'Offset interfaces often display a total row count and numbered pages. Calculating an exact total normally requires a separate `count(*)` query, whose cost should be measured independently from the page query.',
        },
        {
          type: 'paragraph',
          text: 'Keyset interfaces commonly avoid exact page numbers and instead expose navigation such as next, previous, and load more.',
        },
        {
          type: 'paragraph',
          text: 'An application can combine approaches. For example, it may use offset pagination for a small filtered administrative view and keyset pagination for a large public activity feed.',
        },
      ],
    },
    {
      title: 'A Practical Decision Process',
      content: [
        {
          type: 'paragraph',
          text: 'Before choosing a pagination approach, answer these questions:',
        },
        {
          type: 'ordered-list',
          items: [
            {
              paragraphs: [
                'Can the result grow large enough for deep offsets to become expensive?',
              ],
            },
            {
              paragraphs: [
                'Must users jump directly to arbitrary page numbers?',
              ],
            },
            {
              paragraphs: [
                'Does the query have a deterministic order with a unique tie-breaker?',
              ],
            },
            {
              paragraphs: [
                'Is there an index that supports the filters, cursor comparison, and ordering?',
              ],
            },
            {
              paragraphs: [
                'How should inserts, deletions, and updates between page requests affect what the user sees?',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Offset pagination is the simpler page-number model. Keyset pagination is usually the stronger choice for deep sequential navigation over a large, appropriately indexed result.',
        },
        {
          type: 'paragraph',
          text: 'Whichever approach you choose, use a deterministic `ORDER BY` and inspect representative shallow and deep queries with `EXPLAIN ANALYZE`.',
        },
      ],
    },
  ],
} satisfies LessonPlan
