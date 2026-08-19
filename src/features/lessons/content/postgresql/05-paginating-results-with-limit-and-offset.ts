import type { LessonPlan } from '../../model/lesson-plan.types'

export const paginatingResultsWithLimitAndOffsetLesson = {
  id: 'postgresql-05-paginating-results-with-limit-and-offset',
  slug: 'paginating-results-with-limit-and-offset',
  order: 5,
  title: 'Paginating Results with LIMIT and OFFSET',
  category: 'Pagination',
  introduction: [
    'A query can return more rows than an application can display or process at once. Instead of retrieving the complete result, an application can divide it into smaller groups called **pages**.',
    'PostgreSQL provides the `LIMIT` and `OFFSET` clauses for retrieving one page of a result at a time.',
    'In this chapter, you will learn how these clauses work and why pagination requires a predictable row order.',
  ],
  sections: [
    {
      title: 'Limiting the Number of Rows',
      content: [
        {
          type: 'paragraph',
          text: 'The `orders` table contains 100,000 rows. Suppose an application displays 10 orders on each page.',
        },
        {
          type: 'paragraph',
          text: 'Use `LIMIT 10` to return no more than 10 rows:',
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
          text: 'Type the statement into the SQL editor and run it. The result should contain orders 1 through 10:',
        },
        {
          type: 'code',
          language: 'text',
          contents: ` id | payment_reference
----+-------------------
  1 | pay_00000001
  2 | pay_00000002
  3 | pay_00000003
  4 | pay_00000004
  5 | pay_00000005
  6 | pay_00000006
  7 | pay_00000007
  8 | pay_00000008
  9 | pay_00000009
 10 | pay_00000010
(10 rows)`,
        },
        {
          type: 'paragraph',
          text: '`LIMIT 10` specifies the maximum number of rows PostgreSQL should return. If the query produces fewer than 10 rows, PostgreSQL returns only the rows that are available.',
        },
      ],
    },
    {
      title: 'Pagination Requires a Predictable Order',
      content: [
        {
          type: 'paragraph',
          text: 'The query includes:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: 'ORDER BY id',
        },
        {
          type: 'paragraph',
          text: "Without `ORDER BY`, PostgreSQL doesn't guarantee the order in which rows are returned. Different executions could use different plans and produce rows in different orders.",
        },
        {
          type: 'paragraph',
          text: 'Pagination therefore needs an `ORDER BY` that places rows in a predictable order. Ideally, the ordering should also be **unique**, so that PostgreSQL can determine the exact position of every row.',
        },
        {
          type: 'paragraph',
          text: 'The `id` column is the primary key of `orders`, so every value is unique. `ORDER BY id` therefore produces an unambiguous order.',
        },
        {
          type: 'note',
          text: "`LIMIT` without `ORDER BY` is valid SQL, but it doesn't produce a dependable sequence of pages.",
        },
      ],
    },
    {
      title: 'Skipping Rows with OFFSET',
      content: [
        {
          type: 'paragraph',
          text: 'The first query returns the first page. To retrieve the second page, PostgreSQL must skip the first 10 rows before returning the next 10.',
        },
        {
          type: 'paragraph',
          text: 'Use `OFFSET 10` to skip those rows:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
ORDER BY id
LIMIT 10
OFFSET 10;`,
        },
        {
          type: 'paragraph',
          text: 'The result should contain orders 11 through 20.',
        },
        {
          type: 'paragraph',
          text: "`OFFSET` specifies how many rows PostgreSQL should skip before it begins returning rows. It doesn't identify a page by itself; it identifies the starting position within the ordered result.",
        },
        {
          type: 'paragraph',
          text: 'To retrieve the third page, skip the first 20 rows:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
ORDER BY id
LIMIT 10
OFFSET 20;`,
        },
        {
          type: 'paragraph',
          text: 'This query returns orders 21 through 30.',
        },
      ],
    },
    {
      title: 'Choosing the Sort Direction',
      content: [
        {
          type: 'paragraph',
          text: '`ORDER BY id` uses ascending order by default. It is equivalent to:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
ORDER BY id ASC
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: 'Use `DESC` when the largest values should appear first:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
ORDER BY id DESC
LIMIT 10;`,
        },
        {
          type: 'paragraph',
          text: 'When `ORDER BY` contains several expressions, PostgreSQL first sorts by the first expression. Later expressions determine the order of rows that are equal according to the earlier expressions. Each expression can have its own direction.',
        },
        {
          type: 'code',
          language: 'sql',
          contents: 'ORDER BY placed_at DESC, id DESC',
        },
        {
          type: 'paragraph',
          text: 'This kind of multicolumn ordering will become important when you build keyset pagination with a non-unique timestamp.',
        },
        {
          type: 'paragraph',
          text: 'For nullable expressions, `NULLS FIRST` and `NULLS LAST` control where null values appear. By default, nulls appear last for ascending order and first for descending order.',
        },
        {
          type: 'code',
          language: 'sql',
          contents: 'ORDER BY shipped_at DESC NULLS LAST, id DESC',
        },
        {
          type: 'paragraph',
          text: 'A pagination query should keep its directions and null placement consistent on every request. Changing them also changes the meaning of the page boundary.',
        },
      ],
    },
    {
      title: 'Calculating the Offset',
      content: [
        {
          type: 'paragraph',
          text: 'An application can calculate the offset from the requested page number and page size:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'offset = (page number - 1) x page size',
        },
        {
          type: 'paragraph',
          text: 'For page 3 with 10 rows per page:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `offset = (3 - 1) x 10
offset = 20`,
        },
        {
          type: 'paragraph',
          text: 'The resulting clauses are:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `LIMIT 10
OFFSET 20`,
        },
        {
          type: 'paragraph',
          text: 'This approach is called **offset-based pagination**. It is straightforward and allows an application to request a particular page number directly.',
        },
        {
          type: 'paragraph',
          text: 'However, the amount of work required by `OFFSET` changes as the requested page becomes deeper. You will measure that cost in the next chapter.',
        },
      ],
    },
  ],
} satisfies LessonPlan
