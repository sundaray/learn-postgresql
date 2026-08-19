import type { CoursePlan } from '../../model/lesson-plan.types'

import { howPostgresqlExecutesSqlLesson } from './01-how-postgresql-executes-sql'
import { understandingPostgresqlExecutionPlansLesson } from './02-understanding-postgresql-execution-plans'
import { usingExplainAnalyzeToMeasureActualExecutionLesson } from './03-using-explain-analyze-to-measure-actual-execution'
import { improvingQueryPerformanceWithIndexesLesson } from './04-improving-query-performance-with-indexes'
import { paginatingResultsWithLimitAndOffsetLesson } from './05-paginating-results-with-limit-and-offset'
import { understandingTheCostOfLargeOffsetsLesson } from './06-understanding-the-cost-of-large-offsets'
import { introducingKeysetPaginationLesson } from './07-introducing-keyset-pagination'
import { keysetPaginationWithMultipleSortColumnsLesson } from './08-keyset-pagination-with-multiple-sort-columns'
import { navigatingForwardAndBackwardWithCursorsLesson } from './09-navigating-forward-and-backward-with-cursors'
import { choosingBetweenOffsetAndKeysetPaginationLesson } from './10-choosing-between-offset-and-keyset-pagination'

export const postgresqlCourse: CoursePlan = {
  id: 'postgresql-fundamentals',
  slug: 'postgresql',
  title: 'PostgreSQL',
  summary: 'PostgreSQL lessons.',
  description: [],
  learningOutcomes: [],
  dataset: {
    id: 'postgresql-playground-v1',
    name: 'PostgreSQL playground',
    description: 'A local database available for SQL practice.',
    tables: [
      {
        name: 'customers',
        approximateRows: 10_000,
        columns: ['id', 'email', 'full_name', 'country', 'created_at'],
        purpose: 'Sample customer data.',
      },
      {
        name: 'orders',
        approximateRows: 100_000,
        columns: [
          'id',
          'customer_id',
          'status',
          'total_amount',
          'payment_reference',
          'placed_at',
          'shipped_at',
        ],
        purpose: 'Sample order data.',
      },
      {
        name: 'products',
        approximateRows: 5_000,
        columns: ['id', 'sku', 'name', 'category', 'price'],
        purpose: 'Sample product data.',
      },
      {
        name: 'order_items',
        approximateRows: 300_000,
        columns: ['id', 'order_id', 'product_id', 'quantity', 'unit_price'],
        purpose: 'Sample order item data.',
      },
    ],
    distributions: [],
    requirements: [],
  },
  lessons: [
    howPostgresqlExecutesSqlLesson,
    understandingPostgresqlExecutionPlansLesson,
    usingExplainAnalyzeToMeasureActualExecutionLesson,
    improvingQueryPerformanceWithIndexesLesson,
    paginatingResultsWithLimitAndOffsetLesson,
    understandingTheCostOfLargeOffsetsLesson,
    introducingKeysetPaginationLesson,
    keysetPaginationWithMultipleSortColumnsLesson,
    navigatingForwardAndBackwardWithCursorsLesson,
    choosingBetweenOffsetAndKeysetPaginationLesson,
  ],
}
