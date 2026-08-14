import { postgresqlCourse } from '@/features/lessons'

import type { DatabaseSchema } from '../model/practice-workspace.types'

const schema = postgresqlCourse.dataset.tables.reduce<DatabaseSchema>(
  (tables, table) => {
    tables[table.name] = table.columns
    return tables
  },
  {},
)

export const practiceWorkspaceConfig = {
  appName: 'Indexes',
  schema,
}
