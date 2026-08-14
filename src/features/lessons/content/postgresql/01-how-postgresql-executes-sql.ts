import type { LessonPlan } from '../../model/lesson-plan.types'

export const howPostgresqlExecutesSqlLesson = {
  id: 'postgresql-01-how-postgresql-executes-sql',
  slug: 'how-postgresql-executes-sql',
  order: 1,
  title: 'How PostgreSQL executes a SQL statement',
  introduction: [
    'In PostgreSQL, the execution of a SQL statement goes through 4 main stages: **parsing, rewriting, planning and optimization, and execution**.',
  ],
  introDiagram: 'sql-execution-stages',
  sections: [
    {
      title: 'Parsing',
      paragraphs: [
        'PostgreSQL has a component called the **parser**. It reads the SQL statement and checks whether it follows the rules of SQL syntax. If it finds a syntax error, PostgreSQL returns an error and stops processing the statement.',
        'If the syntax is correct, the parser organizes the statement into an internal structure called a **parse tree**. This structure represents the syntactic parts of the statement, such as table and column names, expressions, and clauses such as `WHERE`, `GROUP BY`, and `ORDER BY`.',
        'PostgreSQL then checks what the names in the statement refer to, for example, whether the specified tables and columns exist, and determines the data types of expressions. The resulting structure, called a **query tree**, is passed to the rewriting stage.',
      ],
    },
    {
      title: 'Rewriting',
      paragraphs: [
        'The query tree produced during parsing is then passed to a component called the **rewriter**. The rewriter checks whether any rewrite rules apply to the tables or views involved in the statement. A rewrite rule is an instruction stored in the database that tells PostgreSQL how to transform a query before it is planned and executed.',
        'The most common use of rewriting is to handle **views**. When a query refers to a view, the rewriter expands the view using the query that defines it. This allows PostgreSQL to work with the underlying tables.',
        'Rewrite rules can also replace the original query or add additional queries. If no rewrite rule applies, the query tree remains unchanged.',
        'The resulting query tree, or query trees, is then passed to the **planning and optimization stage**.',
      ],
    },
    {
      title: 'Planning and optimization',
      paragraphs: [
        'Each query tree produced during rewriting is passed to the **planner**, also called the **optimizer**. A SQL statement describes the result PostgreSQL must produce, but it does not normally specify the exact steps for producing it. PostgreSQL can often obtain the same result in several different ways.',
        'The planner considers different ways of carrying out the query. For example, it may choose a **sequential scan**, which scans the table, or one of several ways of using an index, such as an **index scan**. When several tables are involved, it also considers different ways and orders in which to join them.',
        'To compare these options, the planner uses statistics about the data, such as the approximate number of rows in a table and how values are distributed across its columns. It assigns an estimated **cost** to each option based on the amount of work it expects PostgreSQL to perform. Cost does not refer to money or guarantee the actual execution time. It is a value PostgreSQL uses to compare the available options.',
        'The planner selects the option with the lowest estimated cost and turns it into an **execution plan**. This plan describes the operations the executor should perform and the order in which it should perform them. The execution plan is then passed to the execution stage.',
      ],
    },
    {
      title: 'Execution',
      paragraphs: [
        'The execution plan selected by the planner is passed to the **executor**. The executor carries out the operations described in the plan. These operations may include scanning tables, either directly or through indexes, applying filter conditions, joining tables, sorting or grouping data, and calculating expressions.',
        'An execution plan is organized as a tree of smaller operations called **plan nodes**. Each node performs a particular task. When a node needs data, it requests rows from the nodes below it, processes those rows, and passes the results upward. In many cases, PostgreSQL processes one row at a time, although some operations, such as sorting, may need to collect rows before producing a result.',
        'For a `SELECT` statement, the final rows produced by the plan are returned to the client. For statements such as `INSERT`, `UPDATE`, `DELETE`, and `MERGE`, the executor makes the requested changes to the data. Once the work is complete, PostgreSQL returns the result or the status of the operation to the client.',
      ],
    },
  ],
} satisfies LessonPlan
