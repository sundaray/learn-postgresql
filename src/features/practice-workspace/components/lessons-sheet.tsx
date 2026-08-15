import { ListIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import type { CSSProperties } from 'react'

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
import { cn } from '@/lib/utils'

type LessonsSheetProps = {
  appName: string
  bounds: CSSProperties
  currentLesson: number
  lessons: readonly {
    id: string
    title: string
  }[]
  onOpenLesson: (lessonIndex: number) => void
}

/** The course contents, opened from the header so it is reachable from every view. */
export function LessonsSheet({
  appName,
  bounds,
  currentLesson,
  lessons,
  onOpenLesson,
}: LessonsSheetProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-8 justify-center px-0 lg:w-auto lg:px-2.5"
          />
        }
      >
        {isOpen ? <XIcon /> : <ListIcon />}
        {/*
          A narrow header only has room for the icon, but the name has to stay
          in the button's accessible name at every width.
        */}
        <span className="sr-only lg:not-sr-only">Lessons</span>
      </SheetTrigger>

      {/* The trigger doubles as the close button, so the panel needs none. */}
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayStyle={bounds}
        style={{ ...bounds, height: 'auto' }}
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">Lessons</SheetTitle>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-2 pb-4">
          <nav aria-label={`${appName} lessons`} className="flex flex-col gap-1">
            {lessons.map((lesson, lessonIndex) => {
              const isCurrent = lessonIndex === currentLesson - 1

              return (
                <SheetClose
                  key={lesson.id}
                  render={
                    <Button
                      type="button"
                      variant={isCurrent ? 'secondary' : 'ghost'}
                      className={cn(
                        'h-auto w-full justify-start gap-3 px-3 py-3 text-left',
                        isCurrent ? 'font-semibold' : 'font-normal',
                      )}
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
  )
}
