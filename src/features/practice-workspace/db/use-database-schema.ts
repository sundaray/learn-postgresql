import { useEffect, useState } from 'react'
import { Result } from 'better-result'

import { SchemaUnavailable, describeCause } from './errors'
import type { PracticeDatabase } from './practice-database'

export type SchemaColumn = {
  readonly name: string
  readonly type: string
}

export type SchemaTable = {
  readonly name: string
  readonly columns: readonly SchemaColumn[]
}

type SchemaRow = {
  table_name: string
  column_name: string
  data_type: string
}

function isSchemaRow(value: unknown): value is SchemaRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'table_name' in value &&
    typeof value.table_name === 'string' &&
    'column_name' in value &&
    typeof value.column_name === 'string' &&
    'data_type' in value &&
    typeof value.data_type === 'string'
  )
}

function groupSchemaRows(rows: unknown[]): SchemaTable[] {
  const grouped = new Map<string, SchemaColumn[]>()

  for (const row of rows) {
    if (!isSchemaRow(row)) {
      continue
    }

    const columns = grouped.get(row.table_name) ?? []
    columns.push({ name: row.column_name, type: row.data_type })
    grouped.set(row.table_name, columns)
  }

  return [...grouped.entries()].map(([name, columns]) => ({ name, columns }))
}

export function useDatabaseSchema(
  database: PracticeDatabase | null,
  refreshKey: unknown,
): readonly SchemaTable[] {
  const [tables, setTables] = useState<SchemaTable[]>([])

  useEffect(() => {
    if (!database) {
      setTables([])
      return
    }

    let active = true

    void Result.tryPromise({
      try: async () => {
        const result = await database.query(
          `SELECT table_name, column_name, data_type
           FROM information_schema.columns
           WHERE table_schema = 'public'
           ORDER BY table_name, ordinal_position`,
        )
        const rows: unknown[] = result.rows

        return groupSchemaRows(rows)
      },
      catch: (cause) =>
        new SchemaUnavailable({ cause, message: describeCause(cause) }),
    }).then((schemaResult) => {
      if (!active) {
        return
      }

      // Autocomplete is a nicety, so an unreadable information_schema leaves
      // the editor without suggestions rather than failing the workspace.
      setTables(schemaResult.unwrapOr([]))
    })

    return () => {
      active = false
    }
  }, [database, refreshKey])

  return tables
}
