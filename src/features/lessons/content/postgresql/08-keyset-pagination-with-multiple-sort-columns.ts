import type { LessonPlan } from '../../model/lesson-plan.types'

export const keysetPaginationWithMultipleSortColumnsLesson = {
  id: 'postgresql-08-keyset-pagination-with-multiple-sort-columns',
  slug: 'keyset-pagination-with-multiple-sort-columns',
  order: 8,
  title: 'Keyset Pagination with Multiple Sort Columns',
  category: 'Pagination',
  introduction: [
    'The previous chapter used the unique `id` column for both ordering and the keyset cursor.',
    "Applications often need to order rows by a value that isn't unique. For example, an order history may display the most recently placed orders first.",
    'In this chapter, you will create a deterministic order using multiple columns and use the same columns in a keyset cursor.',
  ],
  databaseState: {
    datasetId: 'postgresql-playground-v1',
    setupSql: 'DROP INDEX IF EXISTS idx_orders_placed_at_id;',
    notes: [
      'The lesson starts without its composite pagination index so the learner can create it.',
    ],
  },
  sections: [
    {
      title: 'A Non-Unique Sort Column',
      content: [
        {
          type: 'paragraph',
          text: 'The following query displays the most recently placed orders first:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, placed_at
FROM orders
ORDER BY placed_at DESC
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: "The `placed_at` column isn't unique. Several orders can have the same timestamp, so `ORDER BY placed_at DESC` doesn't define the order of rows whose timestamps are equal.",
        },
        {
          type: 'paragraph',
          text: 'A cursor containing only `placed_at` would have the same problem. If the next query used `placed_at < cursor`, it could skip unreturned orders that have the same timestamp as the final row of the previous page.',
        },
      ],
    },
    {
      title: 'Adding a Unique Tie-Breaker',
      content: [
        {
          type: 'paragraph',
          text: 'Add the primary-key column `id` as a second ordering column:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, placed_at
FROM orders
ORDER BY placed_at DESC, id DESC
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: 'PostgreSQL first orders rows by `placed_at`. When two rows have the same timestamp, it orders those rows by `id`.',
        },
        {
          type: 'paragraph',
          text: 'Because `id` is unique, the combination `(placed_at, id)` defines the exact position of every row. The first page ends with values similar to:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `placed_at = 2024-12-30 00:00:00+00
id        = 86139`,
        },
        {
          type: 'paragraph',
          text: 'Both values must be included in the cursor.',
        },
      ],
    },
    {
      title: 'Creating a Matching Index',
      content: [
        {
          type: 'paragraph',
          text: 'Create a multicolumn B-tree index that matches the pagination order:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `CREATE INDEX idx_orders_placed_at_id
ON orders (placed_at DESC, id DESC);`,
        },
        {
          type: 'paragraph',
          text: 'The index contains both cursor columns in the same order as the `ORDER BY` clause. PostgreSQL can use it to find a cursor position and continue producing rows in the required order.',
        },
        {
          type: 'paragraph',
          text: 'The `id` column also makes every index key unique, even when many orders have the same `placed_at` value.',
        },
      ],
    },
    {
      title: 'Comparing Cursor Tuples',
      content: [
        {
          type: 'paragraph',
          text: 'Use both cursor values to retrieve the next page:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, placed_at
FROM orders
WHERE (placed_at, id) < (
  timestamptz '2024-12-30 00:00:00+00',
  86139
)
ORDER BY placed_at DESC, id DESC
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: 'PostgreSQL compares the two row values from left to right. Conceptually, the condition means:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `placed_at < cursor_placed_at
OR (
  placed_at = cursor_placed_at
  AND id < cursor_id
)`,
        },
        {
          type: 'paragraph',
          text: 'Rows with an earlier timestamp come after the cursor. When the timestamp is equal, rows with a lower `id` come after it because both columns are ordered descending.',
        },
        {
          type: 'paragraph',
          text: 'The next page begins with orders that follow `86139` in this two-column order, including the remaining orders with the same timestamp.',
        },
      ],
    },
    {
      title: 'Inspecting the Plan',
      content: [
        {
          type: 'paragraph',
          text: 'Place `EXPLAIN ANALYZE` before the keyset query:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN ANALYZE
SELECT id, placed_at
FROM orders
WHERE (placed_at, id) < (
  timestamptz '2024-12-30 00:00:00+00',
  86139
)
ORDER BY placed_at DESC, id DESC
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: 'Look for a scan using `idx_orders_placed_at_id` and an index condition containing both `placed_at` and `id`. The scan should produce only the rows required by the `Limit` node.',
        },
        {
          type: 'paragraph',
          text: 'This is the general keyset pattern for a non-unique sort column:',
        },
        {
          type: 'ordered-list',
          items: [
            {
              paragraphs: [
                'Order by the application-facing sort column.',
              ],
            },
            {
              paragraphs: [
                'Add a unique column as the final tie-breaker.',
              ],
            },
            {
              paragraphs: [
                'Include every ordering value in the cursor and comparison.',
              ],
            },
            {
              paragraphs: [
                'Create an index that supports the filtering and ordering pattern.',
              ],
            },
          ],
        },
        {
          type: 'note',
          text: 'Nullable ordering columns require an explicit policy for null ordering and cursor comparisons. This example avoids that complication because both `placed_at` and `id` are declared `NOT NULL`.',
        },
      ],
    },
  ],
} satisfies LessonPlan
