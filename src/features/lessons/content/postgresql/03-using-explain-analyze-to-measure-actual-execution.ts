import type { LessonPlan } from '../../model/lesson-plan.types'

export const usingExplainAnalyzeToMeasureActualExecutionLesson = {
  id: 'postgresql-03-using-explain-analyze-to-measure-actual-execution',
  slug: 'using-explain-analyze-to-measure-actual-execution',
  order: 3,
  title: 'Using EXPLAIN ANALYZE to Measure Actual Execution',
  introduction: [
    "In the previous chapter, you learned that `EXPLAIN` displays the execution plan selected by PostgreSQL's planner, together with estimates such as cost and row count. However, `EXPLAIN` does not execute the SQL statement, so it cannot tell you what actually happened during execution.",
    'To execute the statement and compare the planner\'s estimates with the actual results, you can use `EXPLAIN ANALYZE`.',
    'When the `ANALYZE` option is enabled, PostgreSQL creates the execution plan and then executes it while collecting statistics about what actually happened.',
  ],
  content: [
    {
      type: 'paragraph',
      text: 'The output includes:',
    },
    {
      type: 'unordered-list',
      items: [
        { paragraphs: ["The planner's original estimates"] },
        { paragraphs: ['The actual execution time for each plan node'] },
        {
          paragraphs: ['The actual number of rows produced by each node'],
        },
        { paragraphs: ['The number of times each node was executed'] },
        { paragraphs: ['The total planning and execution times'] },
      ],
    },
    {
      type: 'paragraph',
      text: "This makes `EXPLAIN ANALYZE` one of the most useful tools for understanding whether PostgreSQL's estimates match what really happens during execution.",
    },
    {
      type: 'note',
      text: 'The `ANALYZE` option used with `EXPLAIN` is different from the standalone `ANALYZE` statement. The standalone `ANALYZE` statement collects statistics about table data for the planner. `EXPLAIN ANALYZE` executes a SQL statement and measures what happens.',
    },
  ],
  sections: [
    {
      title: 'Using EXPLAIN ANALYZE',
      content: [
        {
          type: 'paragraph',
          text: 'Suppose you want to inspect the actual execution of the following statement:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT *
FROM products;`,
        },
        {
          type: 'paragraph',
          text: 'Place `EXPLAIN ANALYZE` before the statement:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN ANALYZE
SELECT *
FROM products;`,
        },
        {
          type: 'paragraph',
          text: 'Type the command into the SQL editor and run it. You should see output similar to the following:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `                                             QUERY PLAN
-------------------------------------------------------------------------------------------------------------
 Seq Scan on products  (cost=0.00..96.00 rows=5000 width=39) (actual time=0.019..0.910 rows=5000.00 loops=1)
   Buffers: shared hit=46
 Planning:
   Buffers: shared hit=33
 Planning Time: 0.109 ms
 Execution Time: 1.925 ms
(6 rows)`,
        },
        {
          type: 'paragraph',
          text: 'Your timing and buffer values will probably differ from the ones shown here. They can change between executions depending on your computer, other activity in the database, and whether the required data is already cached.',
        },
        {
          type: 'paragraph',
          text: 'The estimated cost, row count, and plan itself should usually be more stable, although they can also change if the data or database statistics change.',
        },
      ],
    },
    {
      title: 'Estimated and Actual Values',
      content: [
        {
          type: 'paragraph',
          text: 'The plan still begins with the estimates displayed by a plain `EXPLAIN`:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'cost=0.00..96.00 rows=5000 width=39',
        },
        {
          type: 'paragraph',
          text: 'Because the statement was executed, the node now contains an additional group of values:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'actual time=0.019..0.910 rows=5000.00 loops=1',
        },
        {
          type: 'paragraph',
          text: "Let's examine each of these values.",
        },
      ],
    },
    {
      title: 'actual time=0.019..0.910',
      content: [
        {
          type: 'paragraph',
          text: "The two numbers represent the node's actual startup time and actual total time.",
        },
        {
          type: 'paragraph',
          text: "Unlike PostgreSQL's estimated costs, actual times are measured in milliseconds.",
        },
        {
          type: 'paragraph',
          text: 'In this example:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                '`0.019` milliseconds is the time from when the node started until it began producing rows.',
              ],
            },
            {
              paragraphs: [
                '`0.910` milliseconds is the time from when the node started until it finished producing all its rows.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: "These numbers should not be added together. The second value already measures the elapsed time from the beginning of the node's execution until its completion.",
        },
        {
          type: 'paragraph',
          text: 'Therefore, this node completed its work in approximately `0.910` milliseconds, not `0.929` milliseconds.',
        },
        {
          type: 'paragraph',
          text: 'These values are averages per execution of the node. This becomes important when `loops` is greater than `1`.',
        },
      ],
    },
    {
      title: 'rows=5000.00',
      content: [
        {
          type: 'paragraph',
          text: 'The plain `EXPLAIN` output contained the following estimate:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'rows=5000',
        },
        {
          type: 'paragraph',
          text: 'The actual section reports:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'rows=5000.00',
        },
        {
          type: 'paragraph',
          text: 'The first value is the number of rows the planner estimated the node would produce. The second is the average number of rows the node actually produced during each execution.',
        },
        {
          type: 'paragraph',
          text: 'Because `loops=1` in this example, the node actually produced 5,000 rows.',
        },
        {
          type: 'paragraph',
          text: 'The estimate and actual result are equal:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `Estimated rows: 5000
Actual rows:    5000`,
        },
        {
          type: 'paragraph',
          text: 'This tells us that the planner estimated the number of rows accurately.',
        },
        {
          type: 'paragraph',
          text: 'Comparing estimated and actual row counts is one of the most useful reasons to run `EXPLAIN ANALYZE`. Large differences, especially differences of several orders of magnitude, may indicate that PostgreSQL does not have enough information to estimate the result accurately.',
        },
        {
          type: 'paragraph',
          text: 'An inaccurate estimate does not automatically mean that PostgreSQL selected a poor plan, but it is an important warning sign because row estimates influence decisions about scans, joins, sorting, and other operations.',
        },
      ],
    },
    {
      title: 'loops=1',
      content: [
        {
          type: 'paragraph',
          text: 'The `loops` value tells you how many times the plan node was executed.',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'loops=1',
        },
        {
          type: 'paragraph',
          text: 'In this example, the `Seq Scan` node was executed once.',
        },
        {
          type: 'paragraph',
          text: 'Some nodes can be executed multiple times. For example, a child node inside a nested-loop join may be executed once for every row produced by another node.',
        },
        {
          type: 'paragraph',
          text: 'When `loops` is greater than `1`, the reported actual time and row count are averages for one execution of the node.',
        },
        {
          type: 'paragraph',
          text: 'For example:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'actual time=0.010..0.050 rows=2.00 loops=10',
        },
        {
          type: 'paragraph',
          text: 'This means that the node produced an average of two rows during each execution. Across ten executions, it produced approximately 20 rows:',
        },
        {
          type: 'code',
          language: 'text',
          contents: '2 × 10 = 20',
        },
        {
          type: 'paragraph',
          text: 'Its accumulated execution time would be approximately:',
        },
        {
          type: 'code',
          language: 'text',
          contents: '0.050 × 10 = 0.500 milliseconds',
        },
        {
          type: 'paragraph',
          text: "Do not add the execution times of every node in a plan. A parent node's time generally includes work performed by its child nodes, so adding them could count the same work more than once.",
        },
      ],
    },
    {
      title: 'Buffer Information',
      content: [
        {
          type: 'paragraph',
          text: 'The output may also contain information such as:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'Buffers: shared hit=46',
        },
        {
          type: 'paragraph',
          text: 'PostgreSQL stores frequently accessed database pages in a shared memory area called **shared buffers**.',
        },
        {
          type: 'paragraph',
          text: '`shared hit=46` means that 46 buffer accesses found the required pages already available in PostgreSQL\'s shared buffers. PostgreSQL did not need to read those pages into shared buffers again.',
        },
        {
          type: 'paragraph',
          text: 'Depending on the state of the cache, you may instead see, or also see, a `read` value:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'Buffers: shared hit=20 read=26',
        },
        {
          type: 'paragraph',
          text: 'A `read` means PostgreSQL had to request that those pages be read into shared buffers. It does not necessarily prove that they came directly from physical storage because the operating system may already have cached them.',
        },
        {
          type: 'paragraph',
          text: 'You may also see buffer information beneath a `Planning` heading:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `Planning:
  Buffers: shared hit=33`,
        },
        {
          type: 'paragraph',
          text: 'This represents buffer activity that occurred while PostgreSQL was creating the execution plan.',
        },
        {
          type: 'paragraph',
          text: 'In PostgreSQL 18, buffer reporting is enabled automatically when `ANALYZE` is used. If you intentionally want to hide this information, you can disable it:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN (ANALYZE, BUFFERS OFF)
SELECT *
FROM products;`,
        },
      ],
    },
    {
      title: 'Planning Time',
      content: [
        {
          type: 'paragraph',
          text: 'The output includes the time PostgreSQL spent creating the execution plan:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'Planning Time: 0.109 ms',
        },
        {
          type: 'paragraph',
          text: 'Planning time includes the time required to create and optimize the plan from the rewritten statement. It does not include the earlier parsing and rewriting stages.',
        },
        {
          type: 'paragraph',
          text: 'For small and simple statements, planning can occasionally take longer than execution. This is not necessarily a problem. It may simply mean that executing the selected plan required very little work.',
        },
      ],
    },
    {
      title: 'Execution Time',
      content: [
        {
          type: 'paragraph',
          text: 'The output also reports:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'Execution Time: 1.925 ms',
        },
        {
          type: 'paragraph',
          text: 'Execution time is the total time PostgreSQL spent running the statement through the executor. It includes executor startup and shutdown work in addition to the work performed by the plan nodes.',
        },
        {
          type: 'paragraph',
          text: 'It does not include the time spent:',
        },
        {
          type: 'unordered-list',
          items: [
            { paragraphs: ['Parsing the statement'] },
            { paragraphs: ['Rewriting the statement'] },
            {
              paragraphs: ['Creating and optimizing the execution plan'],
            },
            { paragraphs: ['Sending the resulting rows to the client'] },
          ],
        },
        {
          type: 'paragraph',
          text: 'Although the `SELECT` statement is executed, `EXPLAIN ANALYZE` discards its result instead of sending the 5,000 product rows to the client.',
        },
        {
          type: 'paragraph',
          text: 'For this reason, `Execution Time` is not the complete end-to-end time that an application would experience. `EXPLAIN ANALYZE` also adds some measurement overhead of its own.',
        },
        {
          type: 'paragraph',
          text: "You should therefore not add `Planning Time` and `Execution Time` and describe the result as the statement's complete running time. The reported values do not include every stage or the time required to transfer results to an application.",
        },
      ],
    },
    {
      title: 'The Output Row Count',
      content: [
        {
          type: 'paragraph',
          text: 'The final line says:',
        },
        {
          type: 'code',
          language: 'text',
          contents: '(6 rows)',
        },
        {
          type: 'paragraph',
          text: 'As with plain `EXPLAIN`, this is the number of text rows in the displayed plan. It is not the number of products returned by the `SELECT` statement.',
        },
        {
          type: 'paragraph',
          text: 'The number may differ if optional details, such as planning buffer information, are not displayed.',
        },
      ],
    },
    {
      title: 'EXPLAIN ANALYZE Executes the Statement',
      content: [
        {
          type: 'paragraph',
          text: 'Unlike plain `EXPLAIN`, `EXPLAIN ANALYZE` executes the SQL statement.',
        },
        {
          type: 'paragraph',
          text: 'For a `SELECT`, PostgreSQL runs the statement but discards its result. However, data-changing statements such as `INSERT`, `UPDATE`, `DELETE`, and `MERGE` will make their normal changes.',
        },
        {
          type: 'paragraph',
          text: 'For example, the following statement would actually update the product:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN ANALYZE
UPDATE products
SET price = 99.99
WHERE id = 1;`,
        },
        {
          type: 'paragraph',
          text: 'When analyzing a data-changing statement without keeping its changes, you can run it inside a transaction and roll the transaction back:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `BEGIN;

EXPLAIN ANALYZE
UPDATE products
SET price = 99.99
WHERE id = 1;

ROLLBACK;`,
        },
        {
          type: 'paragraph',
          text: 'A rollback protects ordinary transactional database changes, but it cannot undo every possible side effect. For example, sequence increments and actions performed by functions outside the database may persist.',
        },
        {
          type: 'paragraph',
          text: 'For now, the safest approach is to use `EXPLAIN ANALYZE` with `SELECT` statements and perform experiments in a development database.',
        },
      ],
    },
    {
      title: 'Alternative Syntax',
      content: [
        {
          type: 'paragraph',
          text: '`ANALYZE` can also be supplied using the parenthesized option syntax:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN (ANALYZE)
SELECT *
FROM products;`,
        },
        {
          type: 'paragraph',
          text: 'This is equivalent to:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN ANALYZE
SELECT *
FROM products;`,
        },
        {
          type: 'paragraph',
          text: 'The parenthesized form is useful when you want to combine `ANALYZE` with other options:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN (ANALYZE, FORMAT JSON)
SELECT *
FROM products;`,
        },
      ],
    },
  ],
} satisfies LessonPlan
