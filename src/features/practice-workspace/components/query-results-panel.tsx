import { AlertTriangleIcon, TablePropertiesIcon } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'

import type { QueryRun } from '../db/run-query'

type QueryResultsPanelProps = {
  run: QueryRun | null
}

const rowLimit = 200

function DataTable({
  headers,
  rows,
}: {
  headers: readonly string[]
  rows: readonly (readonly (string | number | null)[])[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-center text-sm">
        <thead>
          <tr className="border-b">
            {headers.map((header) => (
              <th
                key={header}
                className="border-r px-3 py-2 font-semibold last:border-r-0"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-r px-3 py-2 text-muted-foreground last:border-r-0"
                >
                  {cell === null ? 'NULL' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Text EXPLAIN is psql-styled; JSON, XML and YAML remain raw documents. */
function ExplainOutput({ text }: { text: string }) {
  return (
    <div className="overflow-x-auto px-4 py-4">
      <pre className="database-output font-mono text-xs leading-6 whitespace-pre">
        {text}
      </pre>
    </div>
  )
}

function RowsTable({ run }: { run: QueryRun }) {
  return (
    <DataTable
      headers={run.fieldNames}
      rows={run.rows.slice(0, rowLimit).map((row) =>
        run.fieldNames.map((fieldName) => {
          const value = row[fieldName]
          return value === null || value === undefined
            ? null
            : typeof value === 'number'
              ? value
              : String(value)
        }),
      )}
    />
  )
}

function ResultBody({ run }: { run: QueryRun }) {
  if (run.error) {
    return (
      <div className="flex gap-3 px-4 py-5">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p className="font-mono text-sm leading-6 break-words text-muted-foreground">
          {run.error.message}
        </p>
      </div>
    )
  }

  if (run.explainOutput && run.rows.length > 0) {
    return (
      <>
        <ExplainOutput text={run.explainOutput} />
        <div className="border-t">
          <RowsTable run={run} />
        </div>
      </>
    )
  }

  if (run.explainOutput) {
    return <ExplainOutput text={run.explainOutput} />
  }

  if (run.rows.length > 0) {
    return <RowsTable run={run} />
  }

  return (
    <p className="px-4 py-5 text-center text-sm text-muted-foreground">
      Statement completed. No rows returned.
    </p>
  )
}

/** A plan speaks for itself, so only row results and failures get a footer. */
function resultFooter(run: QueryRun): string | null {
  if (run.error) {
    return 'Statement failed'
  }

  if (run.explainOutput && run.rows.length === 0) {
    return null
  }

  const shown = Math.min(run.rows.length, rowLimit)
  return run.rows.length > rowLimit
    ? `Rows: ${run.rows.length.toLocaleString()} (showing ${shown})`
    : `Rows: ${run.rows.length.toLocaleString()}`
}

export function QueryResultsPanel({ run }: QueryResultsPanelProps) {
  const footer = run ? resultFooter(run) : null

  return (
    <section className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TablePropertiesIcon className="size-4 text-muted-foreground" />
          Output
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {run ? (
          <>
            <ResultBody run={run} />
            {footer && (
              <p className="border-t px-4 py-2 text-center text-sm font-semibold">
                {footer}
              </p>
            )}
          </>
        ) : (
          <p className="px-4 py-5 text-center text-sm text-muted-foreground">
            Run your query to see the output here.
          </p>
        )}

      </ScrollArea>
    </section>
  )
}
