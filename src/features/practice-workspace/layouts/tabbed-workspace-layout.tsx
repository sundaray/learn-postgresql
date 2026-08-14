import { TabsContent } from '@/components/ui/tabs'
import { LessonPanel } from '../components/lesson-panel'
import { QueryResultsPanel } from '../components/query-results-panel'
import { SqlEditorPanel } from '../components/sql-editor-panel'
import type { WorkspaceLayoutProps } from './workspace-layout.types'

export function TabbedWorkspaceLayout({
  activeStepId,
  failure,
  lesson,
  isRunning,
  onRunSql,
  run,
  runBlockedReason,
  onLoadSnippet,
  onLoadStep,
  onSqlChange,
  schema,
  sql,
  status,
}: WorkspaceLayoutProps) {
  return (
    <div className="h-full min-h-0 bg-background">
      <TabsContent value="lesson" keepMounted className="h-full min-h-0">
        <LessonPanel
          lesson={lesson}
          activeStepId={activeStepId}
          onLoadStep={onLoadStep}
          onLoadSnippet={onLoadSnippet}
        />
      </TabsContent>

      <TabsContent value="code" keepMounted className="h-full min-h-0">
        <SqlEditorPanel
          schema={schema}
          status={status}
          failure={failure}
          runBlockedReason={runBlockedReason}
          sql={sql}
          onSqlChange={onSqlChange}
          onRunSql={onRunSql}
          isRunning={isRunning}
        />
      </TabsContent>

      <TabsContent value="output" keepMounted className="h-full min-h-0">
        <QueryResultsPanel run={run} />
      </TabsContent>
    </div>
  )
}
