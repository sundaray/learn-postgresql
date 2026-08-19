import type { LessonPlan } from '../../model/lesson-plan.types'

export const navigatingForwardAndBackwardWithCursorsLesson = {
  id: 'postgresql-09-navigating-forward-and-backward-with-cursors',
  slug: 'navigating-forward-and-backward-with-cursors',
  order: 9,
  title: 'Navigating Forward and Backward with Cursors',
  category: 'Pagination',
  introduction: [
    'The previous chapters used the final row of a page as the cursor for retrieving the next page.',
    'A complete pagination interface may also need to return to the previous page. That requires using the first row of the current page as another boundary.',
    'In this chapter, you will build both directions using the `orders.id` ordering.',
  ],
  sections: [
    {
      title: 'Moving Forward',
      content: [
        {
          type: 'paragraph',
          text: 'Suppose the current page contains orders 1 through 5. Its final row has an `id` of 5.',
        },
        {
          type: 'paragraph',
          text: 'Retrieve the next page using the final row as the lower boundary:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
WHERE id > 5
ORDER BY id
LIMIT 5;`,
        },
        {
          type: 'paragraph',
          text: 'This returns orders 6 through 10. The final row, `id = 10`, becomes the boundary for moving forward again.',
        },
      ],
    },
    {
      title: 'Finding Rows Before the Current Page',
      content: [
        {
          type: 'paragraph',
          text: 'The current page begins with `id = 6`. To find the five rows before it, reverse the comparison and the scan direction:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM orders
WHERE id < 6
ORDER BY id DESC
LIMIT 5;`,
        },
        {
          type: 'paragraph',
          text: 'This query returns the correct five rows, but it returns them in descending order:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `5
4
3
2
1`,
        },
        {
          type: 'paragraph',
          text: 'The descending scan is necessary because PostgreSQL needs the five rows immediately before `id = 6`, not the first five rows in the entire table.',
        },
      ],
    },
    {
      title: 'Restoring the Display Order',
      content: [
        {
          type: 'paragraph',
          text: 'An application can reverse those five rows after retrieving them. Alternatively, SQL can restore the ascending display order with a subquery:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT id, payment_reference
FROM (
  SELECT id, payment_reference
  FROM orders
  WHERE id < 6
  ORDER BY id DESC
  LIMIT 5
) AS previous_page
ORDER BY id;`,
        },
        {
          type: 'paragraph',
          text: 'The inner query finds the nearest five preceding rows. The outer query then displays those rows in the original ascending order.',
        },
        {
          type: 'paragraph',
          text: 'For a descending main order, the comparisons are reversed:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                'Moving forward through `ORDER BY id DESC` normally uses `id < cursor`.',
              ],
            },
            {
              paragraphs: [
                'Moving backward normally uses `id > cursor` and the opposite temporary ordering.',
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'What the Application Stores',
      content: [
        {
          type: 'paragraph',
          text: 'A page can expose two cursor tokens:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                'A **next cursor** containing the ordering values from the final row.',
              ],
            },
            {
              paragraphs: [
                'A **previous cursor** containing the ordering values from the first row.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'For a single-column example, a cursor could conceptually contain:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `next:     id = 10
previous: id = 6`,
        },
        {
          type: 'paragraph',
          text: 'Applications commonly encode cursor values into opaque strings rather than exposing their internal representation. The server decodes and validates the token before supplying its values as SQL parameters.',
        },
        {
          type: 'paragraph',
          text: 'An opaque cursor can also carry information such as the pagination direction or the ordering used to create it. The client should treat the token as an indivisible value rather than constructing or modifying it.',
        },
        {
          type: 'paragraph',
          text: "Encoding a cursor doesn't encrypt it. Sensitive information shouldn't be placed in a cursor merely because the encoded result is difficult to read. Applications can also sign or otherwise authenticate cursor tokens when they need to detect modification.",
        },
        {
          type: 'paragraph',
          text: 'For multicolumn pagination, each token must contain all ordering values, such as both `placed_at` and `id`.',
        },
        {
          type: 'note',
          text: "Cursor values should be passed to parameterized SQL statements. They shouldn't be concatenated directly into SQL text.",
        },
      ],
    },
    {
      title: 'Sequential Rather Than Page-Number Navigation',
      content: [
        {
          type: 'paragraph',
          text: 'Keyset cursors naturally support actions such as **next**, **previous**, and **load more** because each request begins from a known row boundary.',
        },
        {
          type: 'paragraph',
          text: "They don't naturally support an instruction such as “go directly to page 500.” To do that, the application would first need to know the cursor values at the beginning of page 500.",
        },
        {
          type: 'paragraph',
          text: 'This navigation difference is one of the main factors in choosing between offset and keyset pagination.',
        },
      ],
    },
  ],
} satisfies LessonPlan
