import type { LessonPlan } from '../../model/lesson-plan.types'

export const usingExplainAnalyzeToMeasureActualExecutionLesson = {
  id: 'postgresql-03-using-explain-analyze-to-measure-actual-execution',
  slug: 'using-explain-analyze-to-measure-actual-execution',
  order: 3,
  title: 'Using EXPLAIN ANALYZE to Measure Actual Execution',
  category: 'Indexes',
  introduction: [
    "In the previous chapter, you learned how to use `EXPLAIN` to inspect the execution plan selected by the planner. You also learned that `EXPLAIN` **doesn't** execute the SQL statement. As a result, values such as `cost`, `rows`, and `width` are estimates made by the planner.",
    'But what if you want to compare those estimates with what actually happens when PostgreSQL executes the statement?',
    'For that, you can use `EXPLAIN ANALYZE`.',
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
          text: "The two numbers show how long the node took to start producing rows and how long it took to finish. Unlike PostgreSQL's estimated costs, actual times are measured in milliseconds.",
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
                '`0.019` milliseconds is how long the node took to produce its first row.',
              ],
            },
            {
              paragraphs: [
                '`0.910` milliseconds is how long the node took to finish producing all its rows.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'The second number already includes the first. So, the `Seq Scan` node took approximately `0.910` milliseconds to complete, not `0.929` milliseconds.',
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
          text: '`5000` is the number of rows the planner estimated this node would produce.',
        },
        {
          type: 'paragraph',
          text: '`5000.00` is the average number of rows the node actually produced each time it was executed.',
        },
        {
          type: 'paragraph',
          text: 'You may notice that the actual row count is displayed as `5000.00` rather than `5000`. PostgreSQL reports this value as an average per execution of the node, so it can contain decimal places.',
        },
        {
          type: 'paragraph',
          text: 'In this example, `loops=1`, so the node was executed only once and actually produced 5,000 rows.',
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
          text: 'Comparing estimated and actual row counts is one of the most useful reasons to run `EXPLAIN ANALYZE`. Large differences, especially differences of several orders of magnitude, may indicate that PostgreSQL doesn\'t have enough information to estimate the result accurately.',
        },
        {
          type: 'paragraph',
          text: 'An inaccurate estimate doesn\'t automatically mean that PostgreSQL selected a poor plan, but it\'s an important warning sign because row estimates influence decisions about scans, joins, sorting, and other operations.',
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
          text: 'Some plan nodes can be executed multiple times. When that happens, the actual `time` and `rows` values shown for the node are averages for one execution of that node.',
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
          text: 'This means the node was executed 10 times, and each execution produced an average of 2 rows.',
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
          text: 'PostgreSQL stores table and index data in units called **blocks**. When PostgreSQL accesses this data, the required blocks are held in an area of memory called **shared buffers**.',
        },
        {
          type: 'paragraph',
          text: '`shared hit=46` means that 46 block accesses found the required blocks already in shared buffers. PostgreSQL didn\'t need to read those blocks into shared buffers again.',
        },
        {
          type: 'paragraph',
          text: 'You may also see a `read` value:',
        },
        {
          type: 'code',
          language: 'text',
          contents: 'Buffers: shared hit=20 read=26',
        },
        {
          type: 'paragraph',
          text: '`read=26` means that PostgreSQL had to read 26 blocks into shared buffers. This doesn\'t necessarily mean that the blocks were read from physical storage, because the operating system may already have had the data in memory.',
        },
        {
          type: 'paragraph',
          text: 'For now, the important distinction is:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                "`hit` means the required data was already in PostgreSQL's shared buffers.",
              ],
            },
            {
              paragraphs: [
                '`read` means the required data had to be read into shared buffers.',
              ],
            },
          ],
        },
        {
          type: 'note',
          text: "In PostgreSQL 18, buffer reporting is enabled automatically when `ANALYZE` is used. If you don't want to include buffer information in the output, you can disable it:",
          content: [
            {
              type: 'code',
              language: 'sql',
              contents: `EXPLAIN (ANALYZE, BUFFERS OFF)
SELECT *
FROM products;`,
            },
          ],
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
          text: 'Planning time includes the time required to create and optimize the plan from the rewritten statement. It doesn\'t include the earlier parsing and rewriting stages.',
        },
        {
          type: 'paragraph',
          text: "For small and simple statements, planning can occasionally take longer than execution. This isn't necessarily a problem. It may simply mean that executing the selected plan required very little work.",
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
          text: 'It doesn\'t include the time spent:',
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
          text: 'Although `EXPLAIN ANALYZE` executes the `SELECT` statement, it discards the result instead of sending the 5,000 product rows to the client.',
        },
        {
          type: 'paragraph',
          text: "Therefore, `Execution Time` isn't the complete time an application would experience. It measures the time PostgreSQL spent executing the statement, but it doesn't include the time required to send the resulting rows to the client. `EXPLAIN ANALYZE` also adds some measurement overhead of its own.",
        },
      ],
    },
    {
      title: 'EXPLAIN ANALYZE Executes the Statement',
      content: [
        {
          type: 'paragraph',
          text: 'As I explained earlier, `EXPLAIN ANALYZE` actually executes the SQL statement, unlike plain `EXPLAIN`.',
        },
        {
          type: 'paragraph',
          text: 'For a `SELECT` statement, PostgreSQL executes the query but discards the rows instead of returning them to the client. However, statements such as `INSERT`, `UPDATE`, `DELETE`, and `MERGE` will make their normal changes to the database.',
        },
        {
          type: 'paragraph',
          text: 'For example, the following statement would actually update the matching row:',
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
          text: 'When you want to analyze a data-changing statement without keeping its changes, you can run it inside a transaction and roll the transaction back:',
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
          text: '`EXPLAIN ANALYZE` still executes the `UPDATE`, allowing PostgreSQL to collect the actual execution statistics, but `ROLLBACK` undoes the transactional changes afterward.',
        },
        {
          type: 'note',
          text: 'Rolling back the transaction will undo the normal database changes made by the statement. However, it is still best to experiment with data-changing statements in a development or test database.',
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
