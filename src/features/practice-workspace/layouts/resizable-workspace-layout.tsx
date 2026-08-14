import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { LessonPanel } from '../components/lesson-panel'
import { QueryResultsPanel } from '../components/query-results-panel'
import { SqlEditorPanel } from '../components/sql-editor-panel'
import type { WorkspaceLayoutProps } from './workspace-layout.types'

export function ResizableWorkspaceLayout({
  activeStepId,
  database,
  lesson,
  checks,
  isExecutionAvailable,
  isRunning,
  onRunSql,
  run,
  onLoadStep,
  onSqlChange,
  sql,
}: WorkspaceLayoutProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="bg-background">
      <ResizablePanel
        id="lesson-panel"
        defaultSize="31%"
        minSize="22%"
        maxSize="48%"
      >
        <LessonPanel
          lesson={lesson}
          activeStepId={activeStepId}
          onLoadStep={onLoadStep}
          checks={checks}
          hasRun={run !== null}
        />
      </ResizablePanel>

      <ResizableHandle
        withHandle
        aria-label="Resize lesson and query editor panels"
        className="hover:bg-primary/50 focus-visible:bg-primary/50"
      />

      <ResizablePanel
        id="editor-panel"
        defaultSize="36%"
        minSize="22%"
        maxSize="56%"
      >
        <SqlEditorPanel
          database={database}
          sql={sql}
          onSqlChange={onSqlChange}
          onRunSql={onRunSql}
          isExecutionAvailable={isExecutionAvailable}
          isRunning={isRunning}
        />
      </ResizablePanel>

      <ResizableHandle
        withHandle
        aria-label="Resize query editor and results panels"
        className="hover:bg-primary/50 focus-visible:bg-primary/50"
      />

      <ResizablePanel
        id="results-panel"
        defaultSize="33%"
        minSize="22%"
        maxSize="52%"
      >
        <QueryResultsPanel run={run} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
