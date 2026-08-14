import type { LessonPlan } from '../../model/lesson-plan.types'

export const understandingPostgresqlExecutionPlansLesson = {
  id: 'postgresql-02-understanding-postgresql-execution-plans',
  slug: 'understanding-postgresql-execution-plans',
  order: 2,
  title: 'Understanding PostgreSQL Execution Plans',
  introduction: [
    "In the previous chapter, I explained that during the planning and optimization stage, PostgreSQL's planner, also called the optimizer, decides how a SQL statement should be carried out.",
    'PostgreSQL can often produce the same result in several different ways. Each complete set of operations that PostgreSQL could use is called a candidate execution plan.',
    'For example, the planner may consider scanning an entire table or using an index to locate the required rows. When multiple tables are involved, it may also consider different ways and orders in which to join them.',
    'The planner estimates the cost of each candidate it considers. It then selects the candidate with the lowest estimated cost and passes the selected execution plan to the executor.',
    'For many statements, the planner can examine a large set of possible plans. However, the number of possibilities can grow dramatically when many tables are joined. Examining every possibility could then require too much planning time and memory, so PostgreSQL can use a heuristic search to consider a smaller set of possibilities and find a reasonably good plan.',
    'The planner also does not always have several useful alternatives. For a simple statement involving a table without indexes, a sequential scan may be the only practical way to access the table. However, a single suitable index can give the planner a choice between a sequential scan and an index-based scan. Statements involving multiple tables can introduce additional choices, such as different join orders and join methods, even when the tables do not have indexes.',
  ],
  content: [
    {
      type: 'note',
      text: 'Internally, PostgreSQL represents many of these alternatives using structures called **paths**. Once the planner selects the cheapest path, it turns it into the full execution plan passed to the executor.',
    },
    {
      type: 'paragraph',
      text: 'To inspect the execution plan selected by the planner, use the `EXPLAIN` command. Before you see `EXPLAIN` in action, keep these two important points in mind:',
    },
    {
      type: 'unordered-list',
      items: [
        {
          paragraphs: [
            '`EXPLAIN` does not execute the SQL statement being explained. It displays the execution plan selected by the planner, together with the planner\'s estimates.',
          ],
        },
        {
          paragraphs: [
            'The plan displayed by `EXPLAIN` has the lowest estimated cost among the candidate plans considered by the planner. Therefore, when I call it the "best" plan, I mean the plan PostgreSQL estimates will require the least work. It is not guaranteed to be the fastest plan during actual execution.',
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      text: "Let's get started.",
    },
  ],
  sections: [
    {
      title: 'Using EXPLAIN',
      content: [
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
          contents:
            'Seq Scan on products  (cost=0.00..96.00 rows=5000 width=39)',
        },
        {
          type: 'note',
          text: 'By default, `EXPLAIN` displays its output in text format. It can also return the plan in JSON, XML, or YAML. These structured formats contain the same plan information as the text format, but they are easier for programs and visualization tools to process.',
        },
        {
          type: 'paragraph',
          text: 'You have already seen the text format. Type and run each of the following statements separately to see how the same execution plan is represented in the other formats:',
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
        {
          type: 'paragraph',
          text: "For now, I'll use the default text format because it is compact and easier to read.",
        },
        {
          type: 'paragraph',
          text: 'Each line in an execution plan represents an operation called a **plan node**. A plan node performs one particular task, such as scanning a table, joining rows, or sorting data. This execution plan contains only one plan node:',
        },
        {
          type: 'code',
          language: 'text',
          contents:
            'Seq Scan on products  (cost=0.00..96.00 rows=5000 width=39)',
        },
        {
          type: 'paragraph',
          text: 'Here is what each part means:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                '`Seq Scan on products` means PostgreSQL plans to perform a sequential scan of the `products` table. During a sequential scan, the executor reads the table page by page and examines the rows stored on those pages.',
                'Because this statement has no `WHERE` condition, every row qualifies for the result. The statement also requests every column. In this case, the planner estimates that scanning the table sequentially is less expensive than the available index-based alternatives, so it selects a sequential scan.',
              ],
            },
            {
              paragraphs: [
                '`cost=0.00..96.00` contains the estimated startup cost and total cost of this plan node.',
                'The first value, `0.00`, is the **startup cost**. It represents the work the node must perform before it can produce its first row. A sequential scan has almost no preparation to perform, so its startup cost is `0.00`.',
                'The second value, `96.00`, is the **total cost**. It represents the estimated work required to run the node to completion and produce all its rows. The total cost includes the startup cost.',
                "These values are measured in PostgreSQL's cost units, not milliseconds.",
              ],
            },
            {
              paragraphs: [
                '`rows=5000` is the number of rows the planner estimates this plan node will produce. Because this plan contains only one node, these are also the estimated rows in the final result set.',
                'In a more complex execution plan, each node has its own `rows` estimate. Therefore, `rows` does not always refer to the final result of the entire SQL statement. It refers to the rows produced by the particular node on that line.',
              ],
            },
            {
              paragraphs: [
                '`width=39` is the estimated average size, in bytes, of each row produced by this plan node. It does not represent the number of columns in the row.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Everything inside the parentheses is an estimate made by the planner. Because `EXPLAIN` does not execute the SQL statement, it cannot show the actual number of rows produced or the actual time taken.',
        },
        {
          type: 'paragraph',
          text: 'More complex statements can produce several plan nodes. PostgreSQL displays these nodes on separate, indented lines to show how the operations are connected.',
        },
      ],
    },
    {
      title: 'Reading a Plan with Multiple Nodes',
      content: [
        {
          type: 'paragraph',
          text: 'The execution plan in the previous example contained only one plan node: `Seq Scan`. However, an execution plan can contain multiple nodes when PostgreSQL needs to perform more than one operation.',
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
          text: 'An execution plan is organized as a tree. Each plan node represents an operation PostgreSQL plans to perform.',
        },
        {
          type: 'paragraph',
          text: 'In a simple execution plan like this one, you can identify the plan nodes using the following rules:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                'The first plan line, the first line after the separator, represents the topmost node. It is also called the **root node**. Because it has no parent, it is not preceded by an arrow.',
              ],
            },
            {
              paragraphs: [
                'A node beneath another node is indented to the right and begins with an arrow (`->`). It is called a **child node**.',
              ],
            },
            {
              paragraphs: [
                'An indented line without an arrow usually provides additional information about the node above it. It is not a separate plan node.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Using these rules, we can identify the lines in this plan:',
        },
        {
          type: 'unordered-list',
          items: [
            { paragraphs: ['`Sort` is the root plan node.'] },
            {
              paragraphs: [
                '`Sort Key: price` is not a plan node. It tells us that the `Sort` node will sort the rows by the `price` column.',
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
          text: 'A helpful way to understand this plan is to begin with the most deeply indented node and work upward. PostgreSQL plans to read the rows from the `products` table using a sequential scan. The `Sort` node will then sort those rows by `price` and return the final result.',
        },
        {
          type: 'paragraph',
          text: 'You may notice that the bottom of the output says `(3 rows)`, even though the plan contains only two nodes. This is because `EXPLAIN` produces a one-column result named `QUERY PLAN`, and `psql` counts each line returned in that result as a row. In this example, those three rows are:',
        },
        {
          type: 'ordered-list',
          items: [
            { paragraphs: ['The `Sort` node'] },
            { paragraphs: ['The `Sort Key` detail'] },
            { paragraphs: ['The `Seq Scan` node'] },
          ],
        },
        {
          type: 'paragraph',
          text: 'Therefore, `(3 rows)` does not represent the number of plan nodes or the number of rows the SQL statement would return. It is simply the number of text rows displayed by `EXPLAIN`.',
        },
      ],
    },
  ],
} satisfies LessonPlan
