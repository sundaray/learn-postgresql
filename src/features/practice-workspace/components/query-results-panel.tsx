import { AlertTriangleIcon, TablePropertiesIcon } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import type { ExplainNode } from '../db/explain'
import type { QueryRun } from '../db/run-query'

type QueryResultsPanelProps = {
  run: QueryRun | null
}

const rowLimit = 200

function SectionBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted px-4 py-2 text-center text-sm font-semibold">
      {children}
    </div>
  )
}

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

function flattenPlan(
  node: ExplainNode,
  depth = 0,
): { node: ExplainNode; depth: number }[] {
  return [
    { node, depth },
    ...(node.Plans ?? []).flatMap((child) => flattenPlan(child, depth + 1)),
  ]
}

function PlanTable({ root }: { root: ExplainNode }) {
  const rows = flattenPlan(root).map(({ node, depth }) => [
    `${'   '.repeat(depth)}${node['Node Type']}${node['Relation Name'] ? ` on ${node['Relation Name']}` : ''}`,
    node['Index Name'] ?? node['Index Cond'] ?? node.Filter ?? '',
    node['Actual Rows'] ?? null,
    node['Plan Rows'] ?? null,
    node['Rows Removed by Filter'] ?? null,
    node['Shared Hit Blocks'] ?? null,
  ])

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            {['Node', 'Detail', 'Rows', 'Est.', 'Filtered', 'Blocks'].map((header) => (
              <th
                key={header}
                className="border-r px-3 py-2 text-left font-semibold last:border-r-0"
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
                  className={cn(
                    'border-r px-3 py-2 last:border-r-0',
                    cellIndex === 0
                      ? 'font-mono whitespace-pre'
                      : 'font-mono text-xs text-muted-foreground',
                  )}
                >
                  {cell === null || cell === '' ? '—' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The runner also explains plain SELECTs so completion rules can inspect the
 * plan, but the learner asked for rows. Only lead with the plan when they
 * explicitly ran EXPLAIN.
 */
type QueryRunWithExplain = QueryRun & {
  explain: NonNullable<QueryRun['explain']>
}

function showsPlan(run: QueryRun): run is QueryRunWithExplain {
  return run.explain !== null && run.statements.includes('EXPLAIN')
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

  if (showsPlan(run)) {
    return <PlanTable root={run.explain.root} />
  }

  if (run.rows.length > 0) {
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

  return (
    <p className="px-4 py-5 text-center text-sm text-muted-foreground">
      Statement completed. No rows returned.
    </p>
  )
}

function resultFooter(run: QueryRun) {
  if (run.error) {
    return 'Statement failed'
  }

  if (showsPlan(run)) {
    return `Plan nodes: ${flattenPlan(run.explain.root).length}`
  }

  const shown = Math.min(run.rows.length, rowLimit)
  return run.rows.length > rowLimit
    ? `Rows: ${run.rows.length.toLocaleString()} (showing ${shown})`
    : `Rows: ${run.rows.length.toLocaleString()}`
}

export function QueryResultsPanel({ run }: QueryResultsPanelProps) {
  return (
    <section className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TablePropertiesIcon className="size-4 text-muted-foreground" />
          Output
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <SectionBand>Query Results</SectionBand>

        {run ? (
          <>
            <ResultBody run={run} />
            <p className="border-t px-4 py-2 text-center text-sm font-semibold">
              {resultFooter(run)}
            </p>
          </>
        ) : (
          <p className="px-4 py-5 text-center text-sm text-muted-foreground">
            Run your query to see results here.
          </p>
        )}

      </ScrollArea>
    </section>
  )
}
