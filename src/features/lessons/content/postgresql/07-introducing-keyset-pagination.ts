import type { LessonPlan } from '../../model/lesson-plan.types'

export const introducingKeysetPaginationLesson = {
  id: 'postgresql-07-introducing-keyset-pagination',
  slug: 'introducing-keyset-pagination',
  order: 7,
  title: 'Introducing Keyset Pagination',
  category: 'Pagination',
  introduction: [
    'In the previous chapter, you saw that a large `OFFSET` makes PostgreSQL process and discard all the rows that precede the requested page.',
    '**Keyset pagination** identifies the position of the previous page using values from its last row. The application then asks PostgreSQL for rows that come after those values.',
    'This approach is also commonly called **cursor pagination** or **seek pagination**.',
  ],
  sections: [
    {
      title: 'Retrieving the First Page',
      content: [
        {
          type: 'paragraph',
          text: "The first page doesn't have a previous position. Retrieve it with `ORDER BY` and `LIMIT`:",
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
ORDER BY id
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: 'This query returns orders 1 through 10. The final row has an `id` of 10.',
        },
        {
          type: 'paragraph',
          text: 'The application can remember this value as the position reached by the first page:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'cursor: id = 10',
        },
      ],
    },
    {
      title: 'Retrieving the Next Page',
      content: [
        {
          type: 'paragraph',
          text: 'Instead of skipping 10 rows, ask for rows whose `id` is greater than the cursor:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
WHERE id > 10
ORDER BY id
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: 'This query returns orders 11 through 20. The final row now has an `id` of 20, which becomes the cursor for the following page.',
        },
        {
          type: 'paragraph',
          text: 'The pattern can be represented as:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `WHERE id > cursor
ORDER BY id
LIMIT page_size`,
        },
        {
          type: 'paragraph',
          text: "The cursor identifies a value in the ordered result. It doesn't contain a row count or page number.",
        },
      ],
    },
    {
      title: 'Seeking to a Deep Position',
      content: [
        {
          type: 'paragraph',
          text: 'Suppose the previous page ended with order 90,000. Analyze the query for the next 10 orders:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN ANALYZE
SELECT id, payment_reference
FROM orders
WHERE id > 90000
ORDER BY id
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: 'You should see output similar to this:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `Limit  (cost=0.29..0.69 rows=10 width=17) (actual time=0.005..0.008 rows=10.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using orders_pkey on orders  (cost=0.29..388.11 rows=9818 width=17) (actual time=0.004..0.006 rows=10.00 loops=1)
        Index Cond: (id > 90000)
        Index Searches: 1
        Buffers: shared hit=3
Planning:
  Buffers: shared hit=3
Planning Time: 0.099 ms
Execution Time: 0.015 ms`,
        },
        {
          type: 'paragraph',
          text: 'The primary-key index supports both the condition `id > 90000` and the ordering by `id`. PostgreSQL can seek to the required part of the index and stop after producing 10 rows.',
        },
        {
          type: 'paragraph',
          text: "Unlike the offset query, the `Index Scan` produced only the 10 rows needed by the page. It didn't produce and discard the preceding 90,000 rows.",
        },
      ],
    },
    {
      title: 'Offset and Keyset at the Same Position',
      content: [
        {
          type: 'paragraph',
          text: 'At the same approximate position, the sample plans showed the following:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                '`OFFSET 90000` made the index scan produce 90,010 rows before the query returned 10.',
              ],
            },
            {
              paragraphs: [
                '`WHERE id > 90000` made the index scan produce only the 10 rows that were returned.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'With a suitable index, keyset pagination usually keeps the work for each page much more stable as navigation moves deeper into the result.',
        },
        {
          type: 'paragraph',
          text: "The trade-off is that an application must know the cursor from a previous result. It normally can't jump directly to page 9,001 without first obtaining a cursor near that position.",
        },
        {
          type: 'note',
          text: 'The word cursor in cursor pagination refers to a position value managed by the application. It is different from PostgreSQL server-side cursors created with `DECLARE CURSOR`.',
        },
      ],
    },
  ],
} satisfies LessonPlan
