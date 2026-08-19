import type { LessonPlan } from '../../model/lesson-plan.types'

export const understandingTheCostOfLargeOffsetsLesson = {
  id: 'postgresql-06-understanding-the-cost-of-large-offsets',
  slug: 'understanding-the-cost-of-large-offsets',
  order: 6,
  title: 'Understanding the Cost of Large OFFSETs',
  category: 'Pagination',
  introduction: [
    'In the previous chapter, you used `LIMIT` and `OFFSET` to retrieve a particular page of an ordered result.',
    '`OFFSET` makes page-number-based navigation easy to express, but PostgreSQL must still compute the rows that appear before the requested page.',
    'In this chapter, you will use `EXPLAIN ANALYZE` to compare the beginning of a result with a much deeper page.',
  ],
  sections: [
    {
      title: 'Measuring the First Page',
      content: [
        {
          type: 'paragraph',
          text: 'Begin by analyzing a query that retrieves the first 10 orders:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN ANALYZE
SELECT id, payment_reference
FROM orders
ORDER BY id
LIMIT 10
OFFSET 0;`,
        },
        {
          type: 'paragraph',
          text: 'You should see output similar to the following:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `Limit  (cost=0.29..0.66 rows=10 width=17) (actual time=0.020..0.043 rows=10.00 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using orders_pkey on orders  (cost=0.29..3628.29 rows=100000 width=17) (actual time=0.018..0.030 rows=10.00 loops=1)
        Index Searches: 1
        Buffers: shared hit=3
Planning:
  Buffers: shared hit=19
Planning Time: 0.081 ms
Execution Time: 0.088 ms`,
        },
        {
          type: 'paragraph',
          text: 'The `orders_pkey` B-tree index stores the `id` values in an order that can satisfy `ORDER BY id`. PostgreSQL can begin at the start of the index and stop after the `Limit` node receives 10 rows.',
        },
        {
          type: 'paragraph',
          text: 'The `Index Scan` therefore produced only 10 rows and the plan reported three shared-buffer accesses.',
        },
      ],
    },
    {
      title: 'Measuring a Deep Page',
      content: [
        {
          type: 'paragraph',
          text: 'Now request 10 rows after an offset of 90,000:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN ANALYZE
SELECT id, payment_reference
FROM orders
ORDER BY id
LIMIT 10
OFFSET 90000;`,
        },
        {
          type: 'paragraph',
          text: 'You should see output similar to this:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `Limit  (cost=3265.49..3265.86 rows=10 width=17) (actual time=26.179..26.182 rows=10.00 loops=1)
  Buffers: shared hit=1166
  ->  Index Scan using orders_pkey on orders  (cost=0.29..3628.29 rows=100000 width=17) (actual time=0.005..18.614 rows=90010.00 loops=1)
        Index Searches: 1
        Buffers: shared hit=1166
Planning Time: 0.023 ms
Execution Time: 26.188 ms`,
        },
        {
          type: 'paragraph',
          text: 'The `Limit` node still returned only 10 rows. However, its child `Index Scan` produced 90,010 rows:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'actual rows=90010.00',
        },
        {
          type: 'paragraph',
          text: 'The first 90,000 rows were consumed and discarded by the `Limit` node because of the offset. The remaining 10 rows were returned as the requested page.',
        },
      ],
    },
    {
      title: 'Comparing the Work',
      content: [
        {
          type: 'paragraph',
          text: 'Both queries returned the same number of rows, but they required very different amounts of work:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                '**Offset 0:** The index scan produced 10 rows and reported three shared-buffer accesses.',
              ],
            },
            {
              paragraphs: [
                '**Offset 90,000:** The index scan produced 90,010 rows and reported 1,166 shared-buffer accesses.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Your execution times will differ, but the deep page should require substantially more work than the first page.',
        },
        {
          type: 'paragraph',
          text: "Notice that PostgreSQL used an index for both queries. The index avoided a separate sorting operation, but it couldn't make the 90,000-row offset disappear. PostgreSQL still had to advance through the preceding index entries and fetch the required table rows before it could return the requested page.",
        },
      ],
    },
    {
      title: 'The Cost Grows with the Offset',
      content: [
        {
          type: 'paragraph',
          text: 'For a page size of 10, progressively deeper pages require PostgreSQL to process progressively more rows:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `OFFSET 0      -> process approximately 10 rows
OFFSET 1,000  -> process approximately 1,010 rows
OFFSET 10,000 -> process approximately 10,010 rows
OFFSET 90,000 -> process approximately 90,010 rows`,
        },
        {
          type: 'paragraph',
          text: "This doesn't mean that offset pagination is always a poor choice. It can work well for small result sets, shallow pages, and interfaces that need direct page-number navigation.",
        },
        {
          type: 'paragraph',
          text: 'For large datasets with deep sequential navigation, an alternative called **keyset pagination** can avoid processing all preceding rows.',
        },
      ],
    },
  ],
} satisfies LessonPlan
