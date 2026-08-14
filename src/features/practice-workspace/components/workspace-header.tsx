import { Link } from '@tanstack/react-router'
import { HouseIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { PracticeDatabase } from '../db/practice-database'

import { LessonsSheet } from './lessons-sheet'
import { SchemaSheet } from './schema-sheet'
import { WorkspaceViewTabs } from './workspace-view-tabs'

const workspaceSheetBounds = {
  top: 'var(--workspace-header-height)',
  bottom: 'var(--workspace-footer-height)',
} as const

type WorkspaceHeaderProps = {
  appName: string
  currentLesson: number
  database: PracticeDatabase | null
  lessons: readonly {
    id: string
    title: string
  }[]
  onOpenLesson: (lessonIndex: number) => void
}

export function WorkspaceHeader({
  appName,
  currentLesson,
  database,
  lessons,
  onOpenLesson,
}: WorkspaceHeaderProps) {
  // The dark palette's muted is a neutral grey, which reads as a wash over
  // navy. Retinting it here keeps every hover and open state on the blue.
  return (
    <header className="dark grid h-[var(--workspace-header-height)] shrink-0 grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 border-b bg-navy-950 px-3 text-foreground [--muted:var(--color-navy-800)] lg:flex lg:px-4">
      {/*
        The side columns share the same width so the view tabs stay centred,
        and never squeeze the home button below its label.
      */}
      <div className="flex min-w-0 items-center lg:flex-1">
        <Button variant="ghost" size="sm" render={<Link to="/" />}>
          <HouseIcon data-icon="inline-start" />
          Home
        </Button>
      </div>

      <WorkspaceViewTabs className="min-w-0 max-w-2xl justify-self-center lg:hidden" />

      {/* Both panels open from this edge, so their triggers sit on it. */}
      <div className="flex items-center justify-end gap-1 lg:flex-1">
        <SchemaSheet
          bounds={workspaceSheetBounds}
          database={database}
          className="hidden lg:inline-flex"
        />

        <LessonsSheet
          appName={appName}
          bounds={workspaceSheetBounds}
          currentLesson={currentLesson}
          lessons={lessons}
          onOpenLesson={onOpenLesson}
        />
      </div>
    </header>
  )
}
