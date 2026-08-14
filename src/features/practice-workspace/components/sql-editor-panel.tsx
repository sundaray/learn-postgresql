import {
  AlertTriangleIcon,
  Code2Icon,
  FileCode2Icon,
  PlayIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import type {
  DatabaseSchema,
  WorkspaceFailure,
  WorkspaceStatus,
  WorkspaceStatusTone,
} from '../model/practice-workspace.types'

import { SqlCodeEditor } from './sql-code-editor'

/** Pending has no dot, since a spinner carries that state instead. */
const statusDotColors: Record<Exclude<WorkspaceStatusTone, 'pending'>, string> =
  {
    ready: 'bg-green-500',
    failed: 'bg-destructive',
  }

type SqlEditorPanelProps = {
  schema: DatabaseSchema
  status: WorkspaceStatus
  failure: WorkspaceFailure | null
  /** Why Run is disabled, or null when the statement can be sent. */
  runBlockedReason: string | null
  sql: string
  onSqlChange: (sql: string) => void
  onRunSql: () => void
  isRunning?: boolean
}

/** Failures outside a statement have nowhere else to surface, so they sit here. */
function EditorFailureBanner({ failure }: { failure: WorkspaceFailure }) {
  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-destructive/40 bg-destructive/15 px-4 py-3">
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p className="min-w-0 text-sm font-medium">{failure.title}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto shrink-0"
        onClick={failure.onAction}
      >
        {failure.actionLabel}
      </Button>
    </div>
  )
}

export function SqlEditorPanel({
  failure,
  isRunning = false,
  onRunSql,
  onSqlChange,
  runBlockedReason,
  schema,
  sql,
  status,
}: SqlEditorPanelProps) {
  return (
    <section className="dark flex h-full min-w-0 flex-col bg-navy-900 text-foreground">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <FileCode2Icon className="size-4 text-muted-foreground" />
          <span className="truncate font-medium">lesson.sql</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Open editor options"
        >
          <Code2Icon />
        </Button>
      </div>

      {failure && <EditorFailureBanner failure={failure} />}

      <div className="flex min-h-0 flex-1">
        <SqlCodeEditor sql={sql} schema={schema} onSqlChange={onSqlChange} />
      </div>

      <div className="flex h-16 shrink-0 items-center justify-between border-t px-4">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {status.tone === 'pending' ? (
            <Spinner className="size-3.5 shrink-0" />
          ) : (
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                statusDotColors[status.tone],
              )}
            />
          )}
          <span className="truncate">{status.label}</span>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={runBlockedReason !== null || isRunning}
          onClick={onRunSql}
          title={runBlockedReason ?? 'Run the current SQL'}
        >
          <PlayIcon data-icon="inline-start" />
          {isRunning ? 'Running…' : 'Run query'}
        </Button>
      </div>
    </section>
  )
}
