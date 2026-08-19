import type { LessonPlan } from '../../model/lesson-plan.types'

export const understandingPostgresqlExecutionPlansLesson = {
  id: 'postgresql-02-understanding-postgresql-execution-plans',
  slug: 'understanding-postgresql-execution-plans',
  order: 2,
  title: 'Understanding PostgreSQL Execution Plans',
  category: 'Indexes',
  introduction: [
    "In the previous chapter, I explained that during the planning and optimization stage, PostgreSQL's planner, also called the optimizer, decides how a SQL statement should be executed.",
    'To make that decision, the planner considers different ways PostgreSQL could produce the required result. Each complete set of operations it considers is called a **candidate execution plan**.',
    'For example, the planner may consider scanning an entire table or using an index to locate the required rows. When multiple tables are involved, it may also consider different ways and orders in which to join them.',
    'The planner estimates the cost of each candidate it considers. It then selects the candidate with the lowest estimated cost and passes the selected execution plan to the executor.',
    'To inspect the execution plan selected by the planner, we can use the `EXPLAIN` command.',
  ],
  sections: [
    {
      title: 'Using EXPLAIN',
      content: [
        {
          type: 'paragraph',
          text: 'Before we see `EXPLAIN` in action, keep these two important points in mind:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                '`EXPLAIN` **doesn\'t** execute the SQL statement being explained. It only displays the execution plan selected by the planner, together with the planner\'s estimates.',
              ],
            },
            {
              paragraphs: [
                'The plan displayed by `EXPLAIN` has the lowest estimated cost among the candidate plans considered by the planner. However, it\'s not guaranteed to be the fastest plan during actual execution.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Suppose you want to inspect the execution plan for the following statement:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: 'SELECT * FROM products;',
        },
        {
          type: 'paragraph',
          text: 'Place the `EXPLAIN` command before the statement:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN
SELECT * FROM products;`,
        },
        {
          type: 'paragraph',
          text: 'Type the command into the SQL editor and run it. You should see the following output:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `                            QUERY PLAN
-------------------------------------------------------------------
 Seq Scan on products  (cost=0.00..96.00 rows=5000 width=39)
(1 row)`,
        },
        {
          type: 'paragraph',
          text: "Let's understand what this output means.",
        },
        {
          type: 'paragraph',
          text: '`QUERY PLAN` is the name of the column returned by `EXPLAIN`. The horizontal dashed line beneath it separates the column heading from the rows in the result.',
        },
        {
          type: 'paragraph',
          text: '`Seq Scan` is a **plan node**. A plan node represents one operation that PostgreSQL plans to perform while executing the statement.',
        },
        {
          type: 'paragraph',
          text: '`Seq Scan` means the executor will read through the entire `products` table and examine each row. `on products` tells you which table this operation is performed on.',
        },
        {
          type: 'paragraph',
          text: 'Everything inside the parentheses is additional information about the `Seq Scan` node:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'cost=0.00..96.00 rows=5000 width=39',
        },
        {
          type: 'paragraph',
          text: 'It contains three pieces of information: cost, rows, and width.',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                '**Cost:** Notice that `cost` contains two numbers separated by two periods: `0.00..96.00`. The first number is called the **startup cost**, and the second is called the **total cost**.',
                'The startup cost represents the estimated work PostgreSQL expects to perform before this node can begin producing rows. In this example, the startup cost is `0.00`, which means the sequential scan can begin producing rows without any significant work beforehand.',
                'The total cost represents the estimated work required to run the node to completion and produce all its rows. The total cost includes the startup cost.',
                "These values are measured in PostgreSQL's cost units, not milliseconds.",
              ],
            },
            {
              paragraphs: [
                '**Rows:** `rows=5000` means the planner estimates that this node will produce 5,000 rows. It is an estimate, not the actual number of rows produced.',
              ],
            },
            {
              paragraphs: [
                '**Width:** `width=39` is the estimated average size, in bytes, of each row produced by this node. It doesn\'t represent the number of columns in the row.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Remember that `cost`, `rows`, and `width` are estimates made by the planner. Because plain `EXPLAIN` doesn\'t execute the SQL statement, it can\'t show the actual number of rows produced or the actual execution time.',
        },
        {
          type: 'paragraph',
          text: "Finally, `(1 row)` tells you that the result returned by `EXPLAIN` contains one row. In this example, that row is the line describing the `Seq Scan` node. It doesn't mean that the original `SELECT` statement would return one row.",
        },
      ],
    },
    {
      title: 'EXPLAIN Output Formats',
      content: [
        {
          type: 'paragraph',
          text: 'By default, `EXPLAIN` displays its output in text format. It can also return the plan in JSON, XML, or YAML. These structured formats expose the plan in a more detailed, machine-readable form, which makes them easier for programs and visualization tools to process. The additional details can also be useful when you need to investigate more closely how PostgreSQL plans to execute a statement.',
        },
        {
          type: 'paragraph',
          text: 'When you ran `EXPLAIN SELECT * FROM products;`, the output you saw was in the default text format. To see how the same execution plan is represented in the other formats, type and run each of the following statements one after another:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN (FORMAT JSON)
SELECT * FROM products;`,
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN (FORMAT XML)
SELECT * FROM products;`,
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN (FORMAT YAML)
SELECT * FROM products;`,
        },
      ],
    },
    {
      title: 'Reading an Execution Plan with Multiple Nodes',
      content: [
        {
          type: 'paragraph',
          text: 'The execution plan in the previous example contained only one plan node: `Seq Scan`. However, an execution plan can contain multiple plan nodes when PostgreSQL needs to perform more than one operation. PostgreSQL displays these nodes on separate, indented lines to show how the operations are connected.',
        },
        {
          type: 'paragraph',
          text: 'Type out and run the following statement:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN
SELECT *
FROM products
ORDER BY price;`,
        },
        {
          type: 'paragraph',
          text: 'You should see the following output:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `                            QUERY PLAN
-------------------------------------------------------------------
 Sort  (cost=403.19..415.69 rows=5000 width=39)
   Sort Key: price
   ->  Seq Scan on products  (cost=0.00..96.00 rows=5000 width=39)
(3 rows)`,
        },
        {
          type: 'paragraph',
          text: "How can you identify which lines are plan nodes and which aren't? You can use the following rules:",
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                'The first plan line, which appears immediately after the separator (the horizontal dashed line), represents the topmost node. It\'s also called the **root node**.',
              ],
            },
            {
              paragraphs: [
                'A node beneath another node is indented to the right and begins with an arrow (`->`). It\'s called a **child node**.',
              ],
            },
            {
              paragraphs: [
                'An indented line without an arrow usually provides additional information about the node above it. It\'s not a separate plan node.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Using these rules, we can identify the lines in the execution plan above:',
        },
        {
          type: 'unordered-list',
          items: [
            { paragraphs: ['`Sort` is the root plan node.'] },
            {
              paragraphs: [
                "`Sort Key: price` isn't a plan node. It tells us that the `Sort` node will sort the rows by the `price` column.",
              ],
            },
            {
              paragraphs: [
                '`Seq Scan on products` is a child plan node. It tells us that PostgreSQL plans to read the `products` table using a sequential scan.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'The plan can therefore be represented like this:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `Sort
└── Seq Scan on products`,
        },
        {
          type: 'paragraph',
          text: 'A helpful way to start reading an execution plan is to begin with the lower-level nodes and work upward. In the execution plan above, PostgreSQL first reads the rows from the `products` table using the `Seq Scan` node. The `Sort` node then sorts those rows by `price` and produces the final result.',
        },
      ],
    },
  ],
} satisfies LessonPlan
