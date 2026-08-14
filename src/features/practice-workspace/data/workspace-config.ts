import { postgresqlCourse } from '@/features/lessons'

import type {
  DatabasePreview,
  DatabaseSchema,
} from '../model/practice-workspace.types'

const schema = postgresqlCourse.dataset.tables.reduce<DatabaseSchema>(
  (tables, table) => {
    tables[table.name] = table.columns
    return tables
  },
  {},
)

export const practiceWorkspaceConfig = {
  appName: 'Indexes',
  database: {
    engine: 'PGlite',
    name: postgresqlCourse.dataset.id,
    status: 'not connected',
    schema,
  } satisfies DatabasePreview,
}
