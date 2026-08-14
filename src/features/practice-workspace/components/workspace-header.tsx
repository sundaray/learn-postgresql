import {
  CircleHelpIcon,
  MenuIcon,
  RotateCcwIcon,
  TablePropertiesIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { WorkspaceViewTabs } from './workspace-view-tabs'

const workspaceSheetBounds = {
  top: 'var(--workspace-header-height)',
  bottom: 'var(--workspace-footer-height)',
} as const

type WorkspaceHeaderProps = {
  appName: string
  currentLesson: number
  lessons: readonly {
    id: string
    title: string
  }[]
  onOpenLesson: (lessonIndex: number) => void
  onResetLesson: () => void
}

export function WorkspaceHeader({
  appName,
  currentLesson,
  lessons,
  onOpenLesson,
  onResetLesson,
}: WorkspaceHeaderProps) {
  return (
    <header className="dark grid h-[var(--workspace-header-height)] shrink-0 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2 border-b bg-navy-950 px-3 text-foreground lg:flex lg:px-4">
      <div className="flex min-w-0 items-center gap-3 lg:flex-1">
        <Sheet>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open lesson menu"
              />
            }
          >
            <MenuIcon />
          </SheetTrigger>

          <SheetContent
            side="left"
            overlayStyle={workspaceSheetBounds}
            style={{ ...workspaceSheetBounds, height: 'auto' }}
          >
            <SheetHeader>
              <SheetTitle className="text-lg font-semibold">
                {appName}
              </SheetTitle>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1 px-2 pb-4">
              <nav
                aria-label={`${appName} lessons`}
                className="flex flex-col gap-1"
              >
                {lessons.map((lesson, lessonIndex) => {
                  const isCurrent = lessonIndex === currentLesson - 1

                  return (
                    <SheetClose
                      key={lesson.id}
                      render={
                        <Button
                          type="button"
                          variant={isCurrent ? 'secondary' : 'ghost'}
                          className="h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                          aria-current={isCurrent ? 'page' : undefined}
                          onClick={() => onOpenLesson(lessonIndex)}
                        />
                      }
                    >
                      <span className="shrink-0">{lessonIndex + 1}.</span>
                      <span className="min-w-0 truncate">{lesson.title}</span>
                    </SheetClose>
                  )
                })}
              </nav>
            </ScrollArea>
          </SheetContent>
        </Sheet>

        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-sm font-semibold">{appName}</p>
          <p className="truncate text-xs text-muted-foreground">
            Lesson {currentLesson} of {lessons.length}
          </p>
        </div>
      </div>

      <WorkspaceViewTabs className="min-w-0 max-w-2xl justify-self-center lg:hidden" />

      <div className="size-8 lg:hidden" aria-hidden="true" />

      <div className="hidden flex-1 items-center justify-end gap-1 lg:flex">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onResetLesson}
        >
          <RotateCcwIcon data-icon="inline-start" />
          Reset lab
        </Button>
        <Button type="button" variant="ghost" size="sm">
          <TablePropertiesIcon data-icon="inline-start" />
          Schema
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Get help"
        >
          <CircleHelpIcon />
        </Button>
      </div>
    </header>
  )
}
