import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { Tabs } from '@/components/ui/tabs'
import { postgresqlCourse } from '@/features/lessons'
import { LessonNavigation } from '@/features/practice-workspace/components/lesson-navigation'
import { WorkspaceHeader } from '@/features/practice-workspace/components/workspace-header'
import { practiceWorkspaceConfig } from '@/features/practice-workspace/data/workspace-config'
import type { QueryRun } from '@/features/practice-workspace/db/run-query'
import { ResizableWorkspaceLayout } from '@/features/practice-workspace/layouts/resizable-workspace-layout'
import type { WorkspaceLayoutProps } from '@/features/practice-workspace/layouts/workspace-layout.types'

export const Route = createFileRoute('/workspace-states')({
  component: WorkspaceStates,
})

function getFirstLesson() {
  const firstLesson = postgresqlCourse.lessons[0]

  if (!firstLesson) {
    throw new Error('The PostgreSQL course must contain at least one lesson.')
  }

  return firstLesson
}

const lesson = getFirstLesson()
const sampleSql = 'EXPLAIN SELECT * FROM products;'

const baseProps = {
  activeStepId: null,
  failure: null,
  isRunning: false,
  lesson,
  onLoadSnippet: () => {},
  onLoadStep: () => {},
  onRunSql: () => {},
  onSqlChange: () => {},
  run: null,
  runBlockedReason: null,
  schema: practiceWorkspaceConfig.schema,
  sql: sampleSql,
  status: { tone: 'ready', label: 'Playground ready' },
} satisfies WorkspaceLayoutProps

const failedStatementRun: QueryRun = {
  sql: 'SELECT * FROM prodcts;',
  statements: ['SELECT'],
  rows: [],
  fields: [],
  affectedRows: null,
  commandTags: [],
  explainOutput: null,
  durationMs: 4.1,
  error: {
    severity: 'ERROR',
    message: 'relation "prodcts" does not exist',
    detail: null,
    hint: null,
    position: 15,
  },
}

/** The real workspace shell, minus the state that makes it work. */
function WorkspaceState({
  props,
  shows,
  title,
  when,
}: {
  props: WorkspaceLayoutProps
  shows: ReactNode
  title: string
  when: string
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
          {when}
        </p>
        <p className="max-w-4xl text-sm leading-6">{shows}</p>
      </header>

      <Tabs
        value="code"
        className="h-[680px] gap-0 overflow-hidden rounded-xl border bg-muted/40"
      >
        <WorkspaceHeader
          appName={practiceWorkspaceConfig.appName}
          currentLesson={1}
          database={null}
          lessons={postgresqlCourse.lessons}
          onOpenLesson={() => {}}
          onResetDatabase={() => Promise.resolve()}
        />

        <main className="min-h-0 flex-1">
          <ResizableWorkspaceLayout {...props} />
        </main>

        <LessonNavigation
          currentLesson={1}
          totalLessons={postgresqlCourse.lessons.length}
          canGoBack={false}
          canGoNext
          onBack={() => {}}
          onNext={() => {}}
        />
      </Tabs>
    </section>
  )
}

function WorkspaceStates() {
  return (
    <main className="mx-auto flex max-w-[1700px] flex-col gap-16 px-6 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Temporary review route
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Workspace states
        </h1>
        <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
          The real workspace panels, one copy per state, with the buttons wired
          to nothing. Run tooltips are real title attributes, so hover the
          disabled Run button to read them.
        </p>
      </header>

      <WorkspaceState
        title="1. Ready"
        when="The database started and the lesson data was applied. The normal state."
        shows="Editor footer: green dot, Playground ready. Run query enabled."
        props={baseProps}
      />

      <WorkspaceState
        title="2. Database starting"
        when="First paint, while PGlite boots in its worker. A second or two, longer on a cold IndexedDB store."
        shows="Editor footer: spinner, Starting the database. Run query disabled, tooltip: Waiting for the database to start."
        props={{
          ...baseProps,
          status: {
            tone: 'pending',
            label: 'Starting the database…',
          },
          runBlockedReason: 'Waiting for the database to start',
        }}
      />

      <WorkspaceState
        title="3. Database failed to start"
        when="PGlite never reached a ready state. Today this shows the word unavailable and discards the real message."
        shows="New banner under lesson.sql with a Reload action. Editor footer: red dot, Playground unavailable. Run query disabled for the session."
        props={{
          ...baseProps,
          status: {
            tone: 'failed',
            label: 'Playground unavailable',
          },
          runBlockedReason: 'The database is unavailable',
          failure: {
            title: 'The practice database could not start',
            actionLabel: 'Reload',
            onAction: () => {},
          },
        }}
      />

      <WorkspaceState
        title="4. Preparing lesson"
        when="The database is up and the lesson's setup SQL is running."
        shows="Editor footer: spinner, Preparing lesson. Run query disabled, tooltip: Preparing the lesson data."
        props={{
          ...baseProps,
          status: { tone: 'pending', label: 'Preparing lesson…' },
          runBlockedReason: 'Preparing the lesson data',
        }}
      />

      <WorkspaceState
        title="5. Lesson setup failed"
        when="The database is fine but the lesson's setup SQL failed. Today the footer still claims ready while Run stays disabled forever."
        shows="Banner offers a Try again that re-applies the setup SQL. Editor footer: red dot, Lesson couldn't be prepared."
        props={{
          ...baseProps,
          status: {
            tone: 'failed',
            label: "Lesson couldn't be prepared",
          },
          runBlockedReason: 'Lesson data is not ready',
          failure: {
            title: "This lesson couldn't be loaded",
            actionLabel: 'Try again',
            onAction: () => {},
          },
        }}
      />

      <WorkspaceState
        title="6. Statement rejected by PostgreSQL"
        when="The workspace is healthy and the SQL itself was rejected. The one failure that already works today."
        shows="Output panel shows the psql error block: severity and message, the offending line with a caret under it, then detail and hint when PostgreSQL sends them. No footer. Editor footer stays green: the playground is fine, the query was not."
        props={{
          ...baseProps,
          sql: 'SELECT * FROM prodcts;',
          run: failedStatementRun,
        }}
      />

      <WorkspaceState
        title="7. Nothing to run"
        when="Everything is ready but the editor is empty, so there is nothing to send."
        shows="No error anywhere, since an empty editor is not a failure. Run query disabled, tooltip: Type some SQL to run."
        props={{
          ...baseProps,
          sql: '',
          runBlockedReason: 'Type some SQL to run',
        }}
      />
    </main>
  )
}
