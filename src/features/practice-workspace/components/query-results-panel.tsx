import { TablePropertiesIcon } from 'lucide-react'
import { useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'

import { formatPostgresError } from '../db/format-postgres-error'
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
    <ScrollArea orientation="horizontal" className="w-full">
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
    </ScrollArea>
  )
}

/**
 * Everything psql prints as plain text goes through here: EXPLAIN plans and
 * error blocks alike. The caret under a failing statement only lines up while
 * the text stays unwrapped, so long lines scroll sideways instead.
 */
function ConsoleOutput({ text }: { text: string }) {
  return (
    <ScrollArea orientation="horizontal" className="w-full">
      {/* Padding belongs on the text so it survives to the end of a long line. */}
      <pre className="px-4 py-4 font-mono text-sm leading-6 whitespace-pre">
        {text}
      </pre>
    </ScrollArea>
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
    return <ConsoleOutput text={formatPostgresError(run.error, run.sql)} />
  }

  if (run.explainOutput && run.rows.length > 0) {
    return (
      <>
        <ConsoleOutput text={run.explainOutput} />
        <div className="border-t">
          <RowsTable run={run} />
        </div>
      </>
    )
  }

  if (run.explainOutput) {
    return <ConsoleOutput text={run.explainOutput} />
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

/** A plan and an error message both speak for themselves, so neither gets a footer. */
function resultFooter(run: QueryRun): string | null {
  if (run.error) {
    return null
  }

  if (run.explainOutput && run.rows.length === 0) {
    return null
  }

  const shown = Math.min(run.rows.length, rowLimit)
  return run.rows.length > rowLimit
    ? `Rows: ${run.rows.length.toLocaleString()} (showing ${shown})`
    : `Rows: ${run.rows.length.toLocaleString()}`
}

/**
 * A scroll area decides whether to show a scrollbar from a ResizeObserver on
 * its viewport alone, and this viewport fills the panel whatever the result
 * is. A shorter result therefore leaves the previous measurement standing, and
 * with it a scrollbar for output that is no longer there. Changing the key
 * remounts the area so each result is measured on its own.
 */
function useMeasurementKey(run: QueryRun | null): number {
  const [measuredRun, setMeasuredRun] = useState(run)
  const [key, setKey] = useState(0)

  if (measuredRun !== run) {
    setMeasuredRun(run)
    setKey((current) => current + 1)
  }

  return key
}

export function QueryResultsPanel({ run }: QueryResultsPanelProps) {
  const footer = run ? resultFooter(run) : null
  const measurementKey = useMeasurementKey(run)

  return (
    <section className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TablePropertiesIcon className="size-4 text-muted-foreground" />
          Output
        </div>
      </div>

      <ScrollArea key={measurementKey} className="min-h-0 flex-1">
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
