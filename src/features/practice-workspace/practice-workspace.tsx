import { useMemo, useState } from 'react'

import { Tabs } from '@/components/ui/tabs'
import { postgresqlCourse } from '@/features/lessons'
import type { LessonPlan, LessonStepPlan } from '@/features/lessons'

import { LessonNavigation } from './components/lesson-navigation'
import { WorkspaceHeader } from './components/workspace-header'
import { practiceWorkspaceConfig } from './data/workspace-config'
import { evaluateCompletion } from './db/completion'
import { useLessonSetup } from './db/use-lesson-setup'
import { usePracticeDatabase } from './db/use-practice-database'
import type { PracticeDatabaseStatus } from './db/use-practice-database'
import { useQueryRunner } from './db/use-query-runner'
import { useWorkspaceLayout } from './hooks/use-workspace-layout'
import { ResizableWorkspaceLayout } from './layouts/resizable-workspace-layout'
import { TabbedWorkspaceLayout } from './layouts/tabbed-workspace-layout'
import type { WorkspaceLayoutProps } from './layouts/workspace-layout.types'
import { isWorkspaceView } from './model/practice-workspace.types'
import type { WorkspaceView } from './model/practice-workspace.types'

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

const databaseStatusLabels = {
  starting: 'starting',
  ready: 'ready',
  error: 'unavailable',
} as const satisfies Record<PracticeDatabaseStatus, string>

function getFirstLesson(): LessonPlan {
  const lesson = postgresqlCourse.lessons[0]

  if (!lesson) {
    throw new Error('The PostgreSQL course must contain at least one lesson.')
  }

  return lesson
}

const firstLesson = getFirstLesson()
const firstStep = getInitialStep(firstLesson)

export function PracticeWorkspace() {
  const { appName, database } = practiceWorkspaceConfig
  const lessons = postgresqlCourse.lessons
  const layout = useWorkspaceLayout()
  const [activeView, setActiveView] = useState<WorkspaceView>('lesson')
  const [lessonIndex, setLessonIndex] = useState(0)
  const [activeStepId, setActiveStepId] = useState<string | null>(
    firstStep?.id ?? null,
  )
  const [sqlDrafts, setSqlDrafts] = useState<Record<string, string>>(() =>
    firstStep
      ? { [getStepDraftKey(firstLesson, firstStep)]: firstStep.sql ?? '' }
      : {},
  )
  const practiceDatabase = usePracticeDatabase()
  const {
    clear: clearLastRun,
    lastRun,
    run: runSql,
    status: runnerStatus,
  } = useQueryRunner(practiceDatabase.database)

  const lesson = lessons[lessonIndex] ?? firstLesson
  const lessonSteps = lesson.steps ?? []
  const activeStep =
    lessonSteps.find((step) => step.id === activeStepId) ??
    getInitialStep(lesson)
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

  function openLesson(nextLessonIndex: number) {
    const nextLesson = lessons[nextLessonIndex]

    if (!nextLesson) {
      return
    }

    const nextStep = getInitialStep(nextLesson)

    setLessonIndex(nextLessonIndex)
    setActiveStepId(nextStep?.id ?? null)
    clearLastRun()
    setSqlDrafts((currentDrafts) => {
      if (!nextStep) {
        return currentDrafts
      }

      const nextStepDraftKey = getStepDraftKey(nextLesson, nextStep)

      if (Object.hasOwn(currentDrafts, nextStepDraftKey)) {
        return currentDrafts
      }

      return {
        ...currentDrafts,
        [nextStepDraftKey]: nextStep.sql ?? '',
      }
    })
    setActiveView('lesson')
  }

  function resetLesson() {
    const initialStep = getInitialStep(lesson)

    setSqlDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }

      for (const step of lessonSteps) {
        delete nextDrafts[getStepDraftKey(lesson, step)]
      }
      delete nextDrafts[getScratchDraftKey(lesson)]

      return nextDrafts
    })
    setActiveStepId(initialStep?.id ?? null)
    clearLastRun()
    lessonSetup.reapply()
    setActiveView('lesson')
  }

  const checks = useMemo(
    () =>
      activeStep ? evaluateCompletion(activeStep.completion, lastRun) : [],
    [activeStep, lastRun],
  )

  const liveDatabase = useMemo(
    () => ({ ...database, status: databaseStatusLabels[practiceDatabase.status] }),
    [database, practiceDatabase.status],
  )

  const sharedLayoutProps = {
    activeStepId: activeStep?.id ?? null,
    checks,
    database: liveDatabase,
    isExecutionAvailable:
      practiceDatabase.status === 'ready' &&
      lessonSetup.status === 'applied' &&
      sql.trim().length > 0,
    isRunning: runnerStatus === 'running',
    lesson,
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
        lessons={lessons}
        onOpenLesson={openLesson}
        onResetLesson={resetLesson}
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
