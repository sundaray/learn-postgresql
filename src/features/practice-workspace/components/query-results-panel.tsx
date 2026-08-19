import { TablePropertiesIcon } from 'lucide-react'
import { useState } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { formatPostgresError } from '../db/format-postgres-error'
import type { QueryRun } from '../db/run-query'
import { ResultGrid } from './result-grid'

type QueryResultsPanelProps = {
  run: QueryRun | null
}

/**
 * Everything psql prints as plain text goes through here: EXPLAIN plans and
 * error blocks alike. The caret under a failing statement only lines up while
 * the text stays unwrapped, so long lines scroll sideways instead.
 */
function ConsoleOutput({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <ScrollArea orientation="both" className={cn('min-h-0', className)}>
      {/* Padding belongs on the text so it survives to the end of a long line. */}
      <pre className="px-4 py-4 font-mono text-sm leading-6 whitespace-pre">
        {text}
      </pre>
    </ScrollArea>
  )
}

function ResultBody({ run }: { run: QueryRun }) {
  if (run.error) {
    return (
      <ConsoleOutput
        text={formatPostgresError(run.error, run.sql)}
        className="flex-1"
      />
    )
  }

  // Two statements ran, one of them an EXPLAIN. The plan keeps the height it
  // needs up to half the panel, and the rows take what is left.
  if (run.explainOutput && run.rows.length > 0) {
    return (
      <>
        <ConsoleOutput
          text={run.explainOutput}
          className="max-h-[50%] shrink-0 border-b"
        />
        <div className="min-h-0 flex-1">
          <ResultGrid fields={run.fields} rows={run.rows} />
        </div>
      </>
    )
  }

  if (run.explainOutput) {
    return <ConsoleOutput text={run.explainOutput} className="flex-1" />
  }

  if (run.rows.length > 0) {
    return (
      <div className="min-h-0 flex-1">
        <ResultGrid fields={run.fields} rows={run.rows} />
      </div>
    )
  }

  // A statement with no rows to show still gets an answer from PostgreSQL: the
  // command tag. psql prints that tag on its own, so this does too.
  if (run.commandTags.length > 0) {
    return (
      <ConsoleOutput text={run.commandTags.join('\n')} className="flex-1" />
    )
  }

  return (
    <p className="px-4 py-5 text-center text-sm text-muted-foreground">
      Nothing to run.
    </p>
  )
}

/**
 * A scroll area decides whether to show a scrollbar from a ResizeObserver on
 * its viewport alone, and this viewport fills the panel whatever the result
 * is. A shorter result therefore leaves the previous measurement standing, and
 * with it a scrollbar for output that is no longer there. Changing the key
 * remounts the body so each result is measured on its own, and it starts every
 * result at the top rather than wherever the last one was scrolled to.
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
  const measurementKey = useMeasurementKey(run)

  return (
    <section className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TablePropertiesIcon className="size-4 text-muted-foreground" />
          Output
        </div>
      </div>

      <div key={measurementKey} className="flex min-h-0 flex-1 flex-col">
        {run ? (
          <ResultBody run={run} />
        ) : (
          <p className="px-4 py-5 text-center text-sm text-muted-foreground">
            Run your query to see the output here.
          </p>
        )}
      </div>
    </section>
  )
}
