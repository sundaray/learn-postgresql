import type { LessonPlan } from '../../model/lesson-plan.types'

export const improvingQueryPerformanceWithIndexesLesson = {
  id: 'postgresql-04-improving-query-performance-with-indexes',
  slug: 'improving-query-performance-with-indexes',
  order: 4,
  title: 'Improving Query Performance with Indexes',
  category: 'Indexes',
  introduction: [
    'Run the following query to find the number of rows in the `orders` table:',
  ],
  databaseState: {
    datasetId: 'postgresql-playground-v1',
    setupSql: `DROP INDEX IF EXISTS idx_orders_payment_reference;
ANALYZE orders;`,
    notes: [
      'The lesson starts without an index on orders.payment_reference so that the first execution uses the baseline plan.',
    ],
  },
  content: [
    {
      type: 'code',
      language: 'sql',
      contents: `SELECT count(*) AS order_count
FROM orders;`,
    },
    {
      type: 'paragraph',
      text: 'The result shows that the `orders` table contains 100,000 rows.',
    },
    {
      type: 'paragraph',
      text: 'Now run the following query to view one of those orders:',
    },
    {
      type: 'code',
      language: 'sql',
      contents: `SELECT *
FROM orders
WHERE id = 4242;`,
    },
    {
      type: 'paragraph',
      text: 'Notice that this order has the payment reference `pay_00004242`.',
    },
    {
      type: 'paragraph',
      text: 'Suppose you want to find the order using that payment reference:',
    },
    {
      type: 'code',
      language: 'sql',
      contents: `SELECT *
FROM orders
WHERE payment_reference = 'pay_00004242';`,
    },
    {
      type: 'paragraph',
      text: 'Only one order has this payment reference.',
    },
    {
      type: 'paragraph',
      text: 'Before running the query normally, place `EXPLAIN ANALYZE` before it so that you can inspect its actual execution:',
    },
    {
      type: 'code',
      language: 'sql',
      contents: `EXPLAIN ANALYZE
SELECT *
FROM orders
WHERE payment_reference = 'pay_00004242';`,
    },
    {
      type: 'paragraph',
      text: 'Type the statement into the SQL editor and run it. You should see output similar to the following:',
    },
    {
      type: 'code',
      language: 'text',
      contents: `                                                QUERY PLAN
----------------------------------------------------------------------------------------------------------
 Seq Scan on orders  (cost=0.00..2271.00 rows=1 width=52) (actual time=0.353..7.099 rows=1.00 loops=1)
   Filter: (payment_reference = 'pay_00004242'::text)
   Rows Removed by Filter: 99999
   Buffers: shared hit=1021
 Planning:
   Buffers: shared hit=40
 Planning Time: 0.085 ms
 Execution Time: 7.146 ms
(8 rows)`,
    },
    {
      type: 'paragraph',
      text: 'Your timing and buffer values will probably differ from the ones shown here.',
    },
    {
      type: 'paragraph',
      text: 'The plan contains a `Seq Scan` node:',
    },
    {
      type: 'code',
      language: 'text',
      contents: 'Seq Scan on orders',
    },
    {
      type: 'paragraph',
      text: "This means PostgreSQL performed a sequential scan of the `orders` table. In other words, PostgreSQL went through the rows in the table one by one, checking the `payment_reference` value of each row to determine whether it matched `'pay_00004242'`.",
    },
    {
      type: 'paragraph',
      text: 'Now notice these two values in the plan:',
    },
    {
      type: 'code',
      language: 'text',
      contents: 'rows=1.00',
    },
    {
      type: 'code',
      language: 'text',
      contents: 'Rows Removed by Filter: 99999',
    },
    {
      type: 'paragraph',
      text: "`rows=1.00` tells us that the sequential scan produced one matching row. `Rows Removed by Filter: 99999` tells us that PostgreSQL examined another 99,999 rows that didn't match the condition.",
    },
    {
      type: 'paragraph',
      text: 'Since the sequential scan ran once (`loops=1`), we can add these two values directly: **1 matching row + 99,999 rows removed by the filter = 100,000 rows examined**.',
    },
    {
      type: 'paragraph',
      text: 'PostgreSQL therefore examined all **100,000 rows** in the table to return just **one row**.',
    },
    {
      type: 'paragraph',
      text: 'The plan also reports:',
    },
    {
      type: 'code',
      language: 'text',
      contents: 'Execution Time: 7.146 ms',
    },
    {
      type: 'paragraph',
      text: 'The exact execution time will vary between runs and between computers. More importantly, PostgreSQL had to examine 100,000 rows to return just one.',
    },
    {
      type: 'paragraph',
      text: 'Is there a way for PostgreSQL to find this row without examining all 100,000 rows?',
    },
    {
      type: 'paragraph',
      text: 'Yes. This is one of the problems that **indexes** are designed to solve.',
    },
  ],
  sections: [
    {
      title: 'What Is an Index?',
      content: [
        {
          type: 'paragraph',
          text: 'An **index** is a separate data structure that PostgreSQL maintains for a table. It stores values from one or more table columns in a form that allows PostgreSQL to locate matching table rows efficiently.',
        },
        {
          type: 'paragraph',
          text: 'Without a suitable index, PostgreSQL may need to examine every row in a table:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `Table row -> Does it match?
Table row -> Does it match?
Table row -> Does it match?
...`,
        },
        {
          type: 'paragraph',
          text: 'With a suitable index, PostgreSQL may be able to search the index for the required value and then retrieve only the matching table rows:',
        },
        {
          type: 'code',
          language: 'text',
          contents:
            'Search index -> Locate matching table row -> Retrieve row',
        },
        {
          type: 'paragraph',
          text: 'Indexes are particularly useful for **selective conditions**. A condition is selective when it matches only a small proportion of the table.',
        },
        {
          type: 'paragraph',
          text: 'The condition in our query is highly selective:',
        },
        {
          type: 'code',
          language: 'sql',
          contents:
            "WHERE payment_reference = 'pay_00004242'",
        },
        {
          type: 'paragraph',
          text: 'It matches one row out of 100,000, making it a good candidate for an index.',
        },
        {
          type: 'paragraph',
          text: 'Note that there is no fixed number or percentage of matching rows at which PostgreSQL decides to use an index. When planning a query, PostgreSQL compares the estimated cost of using the available index with other possible plans, such as a sequential scan, and chooses the plan with the lowest estimated cost.',
        },
        {
          type: 'paragraph',
          text: 'Also, PostgreSQL automatically keeps an index up to date as the table data changes. When rows are inserted, updated, or deleted, PostgreSQL updates the index when necessary so that it continues to point to the correct table rows.',
        },
      ],
    },
    {
      title: 'PostgreSQL Index Types',
      content: [
        {
          type: 'paragraph',
          text: 'PostgreSQL provides several built-in index types:',
        },
        {
          type: 'unordered-list',
          items: [
            { paragraphs: ['B-tree'] },
            { paragraphs: ['Hash'] },
            { paragraphs: ['GiST'] },
            { paragraphs: ['SP-GiST'] },
            { paragraphs: ['GIN'] },
            { paragraphs: ['BRIN'] },
          ],
        },
        {
          type: 'paragraph',
          text: 'Each index type is designed for particular kinds of data and operations.',
        },
        {
          type: 'paragraph',
          text: 'In this chapter, we will concentrate on the **B-tree index**. B-tree is the default index type created by PostgreSQL and supports many common equality and range conditions, including:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `=
<
<=
>
>=`,
        },
        {
          type: 'paragraph',
          text: 'Our query uses an equality condition:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: "WHERE payment_reference = 'pay_00004242'",
        },
        {
          type: 'paragraph',
          text: 'A B-tree index can support this type of condition, so it is a suitable index type for our example.',
        },
      ],
    },
    {
      title: 'Creating an Index',
      content: [
        {
          type: 'paragraph',
          text: 'The basic form of `CREATE INDEX` is:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `CREATE INDEX index_name
ON table_name (column_name);`,
        },
        {
          type: 'paragraph',
          text: 'The statement contains three important parts:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                '`index_name` is the name assigned to the index.',
              ],
            },
            {
              paragraphs: [
                '`table_name` is the table the index belongs to.',
              ],
            },
            {
              paragraphs: [
                '`column_name` is the column whose values will be indexed.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'Create an index on the `payment_reference` column:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `CREATE INDEX idx_orders_payment_reference
ON orders (payment_reference);`,
        },
        {
          type: 'paragraph',
          text: 'Type the statement into the SQL editor and run it.',
        },
        {
          type: 'paragraph',
          text: 'The index name is `idx_orders_payment_reference`. The name describes both the table and the indexed column, making the purpose of the index easier to recognize.',
        },
        {
          type: 'paragraph',
          text: "We didn't specify an index type. PostgreSQL therefore created a B-tree index, which is the default. The same index could be defined explicitly like this:",
        },
        {
          type: 'code',
          language: 'sql',
          contents: `CREATE INDEX idx_orders_payment_reference
ON orders USING btree (payment_reference);`,
        },
        {
          type: 'paragraph',
          text: 'Specifying `USING btree` is optional in this case.',
        },
      ],
    },
    {
      title: 'Running the Query Again',
      content: [
        {
          type: 'paragraph',
          text: 'Now run the same statement again:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `EXPLAIN ANALYZE
SELECT *
FROM orders
WHERE payment_reference = 'pay_00004242';`,
        },
        {
          type: 'paragraph',
          text: 'You should now see a different execution plan:',
        },
        {
          type: 'code',
          language: 'text',
          contents: `                                                                    QUERY PLAN
--------------------------------------------------------------------------------------------------------------------------------------------------
 Index Scan using idx_orders_payment_reference on orders  (cost=0.42..8.44 rows=1 width=52) (actual time=0.009..0.010 rows=1.00 loops=1)
   Index Cond: (payment_reference = 'pay_00004242'::text)
   Index Searches: 1
   Buffers: shared hit=1 read=3
 Planning:
   Buffers: shared hit=15 read=1
 Planning Time: 0.078 ms
 Execution Time: 0.018 ms
(8 rows)`,
        },
        {
          type: 'paragraph',
          text: 'The `Seq Scan` has been replaced by an `Index Scan`:',
        },
        {
          type: 'code',
          language: 'text',
          contents:
            'Index Scan using idx_orders_payment_reference on orders',
        },
        {
          type: 'paragraph',
          text: 'This tells us that PostgreSQL used the newly created index to locate the matching order.',
        },
        {
          type: 'paragraph',
          text: 'The next line contains:',
        },
        {
          type: 'code',
          language: 'text',
          contents:
            "Index Cond: (payment_reference = 'pay_00004242'::text)",
        },
        {
          type: 'paragraph',
          text: '`Index Cond` means that PostgreSQL used this condition while searching the index. Previously, the same condition appeared as a `Filter` applied while scanning every table row.',
        },
        {
          type: 'paragraph',
          text: "Notice that the new plan doesn't contain:",
        },
        {
          type: 'code',
          language: 'text',
          contents: 'Rows Removed by Filter: 99999',
        },
        {
          type: 'paragraph',
          text: 'PostgreSQL no longer needs to apply the condition to every row in the table. It can use the index to locate the matching row directly.',
        },
      ],
    },
    {
      title: 'Comparing the Two Plans',
      content: [
        {
          type: 'paragraph',
          text: 'The difference between the two executions can be summarized as follows:',
        },
        {
          type: 'unordered-list',
          items: [
            {
              paragraphs: [
                '**Scan node:** Before the index, PostgreSQL used a `Seq Scan`. After the index, it used an `Index Scan`.',
              ],
            },
            {
              paragraphs: [
                '**Rows returned:** Both executions returned one row.',
              ],
            },
            {
              paragraphs: [
                "**Rows removed by the filter:** The sequential scan removed 99,999 rows. The index scan didn't need to filter those rows.",
              ],
            },
            {
              paragraphs: [
                '**Shared-buffer accesses:** The sample sequential scan reported 1,021. The sample index scan reported four.',
              ],
            },
            {
              paragraphs: [
                '**Estimated total cost:** The estimate changed from `2271.00` to `8.44`.',
              ],
            },
            {
              paragraphs: [
                '**Execution time:** In the sample executions, the time changed from `7.146` milliseconds to `0.018` milliseconds.',
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          text: 'For this particular execution, the reported execution time was approximately 400 times faster after the index was created.',
        },
        {
          type: 'paragraph',
          text: "You shouldn't expect the same timing on every computer or every execution. Timing is affected by caching, hardware, other database activity, and measurement overhead.",
        },
        {
          type: 'paragraph',
          text: 'The more important result is the reduction in work. Before the index was created, PostgreSQL examined 100,000 rows and accessed 1,021 shared blocks. Afterward, it used the index and made only four shared-buffer accesses to locate and retrieve the matching row.',
        },
      ],
    },
    {
      title: "An Index Doesn't Guarantee an Index Scan",
      content: [
        {
          type: 'paragraph',
          text: "Creating an index doesn't force PostgreSQL to use it.",
        },
        {
          type: 'paragraph',
          text: 'The planner considers the available execution plans and selects the one with the lowest estimated cost. For a query that returns one row from a large table, an index scan will often be cheaper.',
        },
        {
          type: 'paragraph',
          text: 'However, if a query returns most or all of a table, a sequential scan may be faster. Reading the table sequentially can require less work than repeatedly moving between an index and the table.',
        },
        {
          type: 'paragraph',
          text: 'For example, the following statement returns every order:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT *
FROM orders;`,
        },
        {
          type: 'paragraph',
          text: "An index on `payment_reference` doesn't help this query because PostgreSQL still needs to retrieve every row.",
        },
        {
          type: 'paragraph',
          text: 'A sequential scan is therefore not automatically a sign of poor performance. It becomes worth investigating when PostgreSQL examines a large number of rows but returns only a small number of them.',
        },
      ],
    },
    {
      title: 'Indexes Have Costs',
      content: [
        {
          type: 'paragraph',
          text: "The performance improvement provided by an index isn't free.",
        },
        {
          type: 'paragraph',
          text: 'An index requires additional storage. You can inspect the size of the table and the index with the following statement:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT
  pg_size_pretty(pg_relation_size('orders')) AS table_size,
  pg_size_pretty(
    pg_relation_size('idx_orders_payment_reference')
  ) AS index_size;`,
        },
        {
          type: 'paragraph',
          text: 'You should see values similar to these:',
        },
        {
          type: 'code',
          language: 'text',
          contents: ` table_size | index_size
------------+------------
 8168 kB    | 3104 kB
(1 row)`,
        },
        {
          type: 'paragraph',
          text: 'The exact sizes may differ, but the important point is that the index occupies additional storage.',
        },
        {
          type: 'paragraph',
          text: 'Indexes also add work when table data changes. PostgreSQL must keep the index synchronized when relevant rows are inserted, updated, or deleted. Additional indexes can therefore make write operations more expensive.',
        },
        {
          type: 'paragraph',
          text: "For this reason, you shouldn't create an index on every column. An index is most valuable when it supports queries that are important and frequently executed.",
        },
        {
          type: 'note',
          text: 'On a production table that is actively being used, creating an index with a regular `CREATE INDEX` can be disruptive. You can continue to run `SELECT` queries while the index is being built, but `INSERT`, `UPDATE`, and `DELETE` operations on that table must wait until the index build finishes.',
          content: [
            {
              type: 'paragraph',
              text: 'PostgreSQL also provides `CREATE INDEX CONCURRENTLY`, which allows those write operations to continue while the index is being built. The tradeoff is that building the index this way requires more work, usually takes longer, and comes with some additional restrictions.',
            },
          ],
        },
      ],
    },
    {
      title: 'Removing an Index',
      content: [
        {
          type: 'paragraph',
          text: 'Before removing an index, you can check which indexes currently exist on the `orders` table. Run the following query:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: `SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'orders';`,
        },
        {
          type: 'paragraph',
          text: 'The result includes the name and definition of each index on the table.',
        },
        {
          type: 'paragraph',
          text: 'Suppose you no longer need the `idx_orders_payment_reference` index. You can remove it using the following statement:',
        },
        {
          type: 'code',
          language: 'sql',
          contents: 'DROP INDEX idx_orders_payment_reference;',
        },
        {
          type: 'paragraph',
          text: "Dropping the index removes only the index. It doesn't remove the `orders` table or any of its rows.",
        },
        {
          type: 'paragraph',
          text: "The important lesson isn't that index scans are always better than sequential scans. It is that `EXPLAIN ANALYZE` can reveal when PostgreSQL is performing substantially more work than the result appears to require, and a suitable index can give the planner a more efficient option.",
        },
      ],
    },
  ],
} satisfies LessonPlan
