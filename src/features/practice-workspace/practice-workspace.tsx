import { useMemo, useState } from 'react'

import { Tabs } from '@/components/ui/tabs'
import { postgresqlCourse } from '@/features/lessons'
import type { LessonPlan, LessonStepPlan } from '@/features/lessons'

import { LessonNavigation } from './components/lesson-navigation'
import { WorkspaceHeader } from './components/workspace-header'
import { practiceWorkspaceConfig } from './data/workspace-config'
import { useDatabaseReset } from './db/use-database-reset'
import type { DatabaseResetStatus } from './db/use-database-reset'
import { useLessonSetup } from './db/use-lesson-setup'
import type { LessonSetupStatus } from './db/use-lesson-setup'
import { usePracticeDatabase } from './db/use-practice-database'
import type { PracticeDatabaseStatus } from './db/use-practice-database'
import { useQueryRunner } from './db/use-query-runner'
import { useWorkspaceLayout } from './hooks/use-workspace-layout'
import { ResizableWorkspaceLayout } from './layouts/resizable-workspace-layout'
import { TabbedWorkspaceLayout } from './layouts/tabbed-workspace-layout'
import type { WorkspaceLayoutProps } from './layouts/workspace-layout.types'
import { isWorkspaceView } from './model/practice-workspace.types'
import type {
  WorkspaceFailure,
  WorkspaceStatus,
  WorkspaceView,
} from './model/practice-workspace.types'

function getInitialStep(lesson: LessonPlan): LessonStepPlan | null {
  const steps = lesson.steps ?? []
  return steps.find((candidate) => candidate.sql) ?? steps[0] ?? null
}

function getStepDraftKey(lesson: LessonPlan, step: LessonStepPlan) {
  return `${lesson.id}:${step.id}`
}

function getScratchDraftKey(lesson: LessonPlan) {
  return `${lesson.id}:scratch`
}

function readWorkspaceStatus(
  databaseStatus: PracticeDatabaseStatus,
  setupStatus: LessonSetupStatus,
  resetStatus: DatabaseResetStatus,
): WorkspaceStatus {
  if (databaseStatus === 'error') {
    return { tone: 'failed', label: 'Playground unavailable' }
  }

  if (databaseStatus === 'starting') {
    return { tone: 'pending', label: 'Starting the database…' }
  }

  if (resetStatus === 'resetting') {
    return { tone: 'pending', label: 'Resetting the database…' }
  }

  if (setupStatus === 'error') {
    return { tone: 'failed', label: "Lesson couldn't be prepared" }
  }

  if (setupStatus !== 'applied') {
    return { tone: 'pending', label: 'Preparing lesson…' }
  }

  return { tone: 'ready', label: 'Playground ready' }
}

/** Names the one condition holding Run back, so the tooltip can be specific. */
function readRunBlockedReason(
  databaseStatus: PracticeDatabaseStatus,
  setupStatus: LessonSetupStatus,
  resetStatus: DatabaseResetStatus,
  sql: string,
): string | null {
  if (databaseStatus === 'error') return 'The database is unavailable'
  if (databaseStatus === 'starting') return 'Waiting for the database to start'
  if (resetStatus === 'resetting') return 'Resetting the database'
  if (setupStatus === 'error') return 'Lesson data is not ready'
  if (setupStatus !== 'applied') return 'Preparing the lesson data'
  if (!sql.trim()) return 'Type some SQL to run'

  return null
}

/** Falls back to the first lesson so an unknown slug still renders a workspace. */
function findLessonBySlugOrFirst(lessonSlug: string): LessonPlan {
  const matchedLesson = postgresqlCourse.lessons.find(
    (candidate) => candidate.slug === lessonSlug,
  )

  if (matchedLesson) {
    return matchedLesson
  }

  const firstLesson = postgresqlCourse.lessons[0]

  if (!firstLesson) {
    throw new Error('The PostgreSQL course must contain at least one lesson.')
  }

  return firstLesson
}

type PracticeWorkspaceProps = {
  lessonSlug: string
  onOpenLesson: (lessonSlug: string) => void
}

export function PracticeWorkspace({
  lessonSlug,
  onOpenLesson,
}: PracticeWorkspaceProps) {
  const { appName, schema } = practiceWorkspaceConfig
  const lessons = postgresqlCourse.lessons
  const lesson = findLessonBySlugOrFirst(lessonSlug)
  const lessonIndex = lessons.indexOf(lesson)
  const layout = useWorkspaceLayout()
  const [activeView, setActiveView] = useState<WorkspaceView>('lesson')
  const [openedLessonSlug, setOpenedLessonSlug] = useState(lesson.slug)
  const [activeStepId, setActiveStepId] = useState<string | null>(
    () => getInitialStep(lesson)?.id ?? null,
  )
  const [sqlDrafts, setSqlDrafts] = useState<Record<string, string>>({})
  const practiceDatabase = usePracticeDatabase()
  const databaseReset = useDatabaseReset(practiceDatabase.database)
  const {
    clear: clearLastRun,
    lastRun,
    run: runSql,
    status: runnerStatus,
  } = useQueryRunner(practiceDatabase.database)

  // The URL now decides which lesson is open, so a slug change has to drop
  // what belonged to the previous lesson before this render paints. Drafts
  // survive, since their keys carry the lesson they were typed against.
  if (openedLessonSlug !== lesson.slug) {
    setOpenedLessonSlug(lesson.slug)
    setActiveStepId(getInitialStep(lesson)?.id ?? null)
    setActiveView('lesson')
    clearLastRun()
  }

  const lessonSteps = lesson.steps ?? []
  // A null active step means the editor is on the lesson's scratch draft, which
  // is where a snippet loaded straight from the lesson text goes.
  const activeStep =
    lessonSteps.find((step) => step.id === activeStepId) ?? null
  const lessonSetup = useLessonSetup(
    practiceDatabase.database,
    lesson.databaseState?.setupSql ?? '',
  )
  const activeStepDraftKey = activeStep
    ? getStepDraftKey(lesson, activeStep)
    : getScratchDraftKey(lesson)
  const sql = sqlDrafts[activeStepDraftKey] ?? activeStep?.sql ?? ''

  function loadStep(step: LessonStepPlan) {
    const stepDraftKey = getStepDraftKey(lesson, step)

    setActiveStepId(step.id)
    clearLastRun()
    setSqlDrafts((currentDrafts) => {
      if (Object.hasOwn(currentDrafts, stepDraftKey)) {
        return currentDrafts
      }

      return {
        ...currentDrafts,
        [stepDraftKey]: step.sql ?? '',
      }
    })
    setActiveView('code')
  }

  /** Puts a snippet from the lesson text into the editor so it can be run as is. */
  function loadSnippet(snippetSql: string) {
    const scratchDraftKey = getScratchDraftKey(lesson)

    setActiveStepId(null)
    clearLastRun()
    setSqlDrafts((currentDrafts) => ({
      ...currentDrafts,
      [scratchDraftKey]: snippetSql,
    }))
    setActiveView('code')
  }

  function updateSql(nextSql: string) {
    setSqlDrafts((currentDrafts) => {
      if (currentDrafts[activeStepDraftKey] === nextSql) {
        return currentDrafts
      }

      return {
        ...currentDrafts,
        [activeStepDraftKey]: nextSql,
      }
    })
  }

  /**
   * The rebuilt schema carries none of the indexes the open lesson expects, and
   * the results on screen describe rows that no longer exist, so both are put
   * back in step with the database the learner now has.
   */
  async function resetPracticeDatabase() {
    if (!(await databaseReset.reset())) {
      return
    }

    clearLastRun()
    lessonSetup.reapply()
  }

  function openLesson(nextLessonIndex: number) {
    const nextLesson = lessons[nextLessonIndex]

    if (!nextLesson) {
      return
    }

    onOpenLesson(nextLesson.slug)
  }

  const failure = useMemo((): WorkspaceFailure | null => {
    if (practiceDatabase.error) {
      return {
        title: 'The practice database could not start',
        actionLabel: 'Reload',
        onAction: () => window.location.reload(),
      }
    }

    if (databaseReset.error) {
      return {
        title: 'The database could not be reset',
        actionLabel: 'Try again',
        onAction: () => {
          void databaseReset.reset()
        },
      }
    }

    if (lessonSetup.error) {
      return {
        title: "This lesson couldn't be loaded",
        actionLabel: 'Try again',
        onAction: lessonSetup.reapply,
      }
    }

    return null
  }, [
    databaseReset.error,
    databaseReset.reset,
    lessonSetup.error,
    lessonSetup.reapply,
    practiceDatabase.error,
  ])

  const sharedLayoutProps = {
    activeStepId: activeStep?.id ?? null,
    failure,
    runBlockedReason: readRunBlockedReason(
      practiceDatabase.status,
      lessonSetup.status,
      databaseReset.status,
      sql,
    ),
    schema,
    status: readWorkspaceStatus(
      practiceDatabase.status,
      lessonSetup.status,
      databaseReset.status,
    ),
    isRunning: runnerStatus === 'running',
    lesson,
    onLoadSnippet: loadSnippet,
    onLoadStep: loadStep,
    onRunSql: () => {
      void runSql(sql)
    },
    onSqlChange: updateSql,
    run: lastRun,
    sql,
  } satisfies WorkspaceLayoutProps

  return (
    <Tabs
      value={activeView}
      onValueChange={(value) => {
        if (isWorkspaceView(value)) {
          setActiveView(value)
        }
      }}
      className="h-dvh min-h-[560px] w-full gap-0 overflow-hidden bg-muted/40"
    >
      <WorkspaceHeader
        appName={appName}
        currentLesson={lessonIndex + 1}
        database={practiceDatabase.database}
        lessons={lessons}
        onOpenLesson={openLesson}
        onResetDatabase={resetPracticeDatabase}
      />

      <main
        className="min-h-0 flex-1"
        aria-label="PostgreSQL learning workspace"
      >
        {layout === 'resizable' ? (
          <ResizableWorkspaceLayout {...sharedLayoutProps} />
        ) : (
          <TabbedWorkspaceLayout {...sharedLayoutProps} />
        )}
      </main>

      <LessonNavigation
        currentLesson={lessonIndex + 1}
        totalLessons={lessons.length}
        canGoBack={lessonIndex > 0}
        canGoNext={lessonIndex < lessons.length - 1}
        onBack={() => openLesson(lessonIndex - 1)}
        onNext={() => openLesson(lessonIndex + 1)}
      />
    </Tabs>
  )
}
