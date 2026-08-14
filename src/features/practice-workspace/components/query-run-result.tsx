import { AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react'

import type { ExplainNode } from '../db/explain'
import type { QueryRun } from '../db/run-query'

type QueryRunResultProps = {
  run: QueryRun
}

type PlanRow = {
  node: ExplainNode
  depth: number
}

function flattenPlan(node: ExplainNode, depth = 0): PlanRow[] {
  return [
    { node, depth },
    ...(node.Plans ?? []).flatMap((child) => flattenPlan(child, depth + 1)),
  ]
}

function formatNumber(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '—'
}

function PlanTree({ root }: { root: ExplainNode }) {
  const rows = flattenPlan(root)

  return (
    <ul className="flex flex-col gap-2">
      {rows.map(({ node, depth }, index) => (
        <li
          key={`${node['Node Type']}-${index}`}
          className="border-l-2 border-primary/60 pl-3 text-sm"
          style={{ marginLeft: `${depth}rem` }}
        >
          <p className="font-mono font-semibold">
            {node['Node Type']}
            {node['Relation Name'] ? ` on ${node['Relation Name']}` : ''}
          </p>

          {node['Index Name'] && (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              using {node['Index Name']}
            </p>
          )}

          {(node['Index Cond'] || node.Filter) && (
            <p className="mt-0.5 font-mono text-xs break-words text-muted-foreground">
              {node['Index Cond'] ? `Index Cond: ${node['Index Cond']}` : ''}
              {node['Index Cond'] && node.Filter ? ' · ' : ''}
              {node.Filter ? `Filter: ${node.Filter}` : ''}
            </p>
          )}

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Actual rows</dt>
              <dd className="font-mono">{formatNumber(node['Actual Rows'])}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Estimated rows</dt>
              <dd className="font-mono">{formatNumber(node['Plan Rows'])}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Rows filtered</dt>
              <dd className="font-mono">
                {formatNumber(node['Rows Removed by Filter'])}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Shared blocks</dt>
              <dd className="font-mono">
                {formatNumber(node['Shared Hit Blocks'])}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  )
}

function RowsTable({ run }: { run: QueryRun }) {
  const preview = run.rows.slice(0, 50)

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="border-b bg-muted/50">
          <tr>
            {run.fieldNames.map((fieldName) => (
              <th key={fieldName} className="px-3 py-2 font-medium">
                {fieldName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b last:border-b-0">
              {run.fieldNames.map((fieldName) => (
                <td key={fieldName} className="px-3 py-2 font-mono">
                  {row[fieldName] === null ? '—' : String(row[fieldName])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function QueryRunResult({ run }: QueryRunResultProps) {
  if (run.error) {
    return (
      <section className="flex gap-3" aria-labelledby="run-result-heading">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="flex min-w-0 flex-col gap-2">
          <h3 id="run-result-heading" className="text-sm font-semibold">
            PostgreSQL rejected the statement
          </h3>
          <p className="font-mono text-sm leading-6 break-words text-muted-foreground">
            {run.error.message}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="run-result-heading">
      <div className="flex items-center gap-2">
        <CheckCircle2Icon className="size-4" />
        <h3 id="run-result-heading" className="text-sm font-semibold">
          {run.statements.join(' · ') || 'Statement'} completed
        </h3>
      </div>

      {run.explain && <PlanTree root={run.explain.root} />}

      {!run.explain && run.rows.length > 0 && <RowsTable run={run} />}

      {!run.explain && run.rows.length === 0 && (
        <p className="text-sm leading-6 text-muted-foreground">
          The statement completed and returned no rows.
        </p>
      )}

      {run.rows.length > 50 && (
        <p className="text-xs text-muted-foreground">
          Showing the first 50 of {run.rows.length.toLocaleString()} rows.
        </p>
      )}
    </section>
  )
}
