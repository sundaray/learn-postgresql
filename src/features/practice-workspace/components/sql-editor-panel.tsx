import { Code2Icon, FileCode2Icon, PlayIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { DatabasePreview } from '../model/practice-workspace.types'

import { SqlCodeEditor } from './sql-code-editor'

type SqlEditorPanelProps = {
  database: DatabasePreview
  sql: string
  onSqlChange: (sql: string) => void
  onRunSql: () => void
  isExecutionAvailable?: boolean
  isRunning?: boolean
}

export function SqlEditorPanel({
  database,
  isExecutionAvailable = false,
  isRunning = false,
  onRunSql,
  onSqlChange,
  sql,
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

      <div className="flex min-h-0 flex-1">
        <SqlCodeEditor
          sql={sql}
          schema={database.schema}
          onSqlChange={onSqlChange}
        />
      </div>

      <div className="flex h-16 shrink-0 items-center justify-between border-t px-4">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full bg-primary" />
          <span className="truncate">
            {database.engine} · {database.name} · {database.status}
          </span>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!isExecutionAvailable || isRunning}
          onClick={onRunSql}
          title={
            isExecutionAvailable
              ? 'Run the current SQL'
              : 'Waiting for the database to start'
          }
        >
          <PlayIcon data-icon="inline-start" />
          {isRunning ? 'Running…' : 'Run query'}
        </Button>
      </div>
    </section>
  )
}
