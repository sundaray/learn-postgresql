import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

type LessonNavigationProps = {
  currentLesson: number
  totalLessons: number
  canGoBack: boolean
  canGoNext: boolean
  onBack: () => void
  onNext: () => void
}

export function LessonNavigation({
  canGoBack,
  canGoNext,
  currentLesson,
  onBack,
  onNext,
  totalLessons,
}: LessonNavigationProps) {
  return (
    <footer className="dark flex h-[var(--workspace-footer-height)] shrink-0 items-center justify-between gap-3 border-t bg-navy-950 px-3 text-foreground sm:px-4 lg:grid lg:grid-cols-3">
      <div className="hidden lg:block" />

      <p className="text-sm font-medium lg:text-center">
        {currentLesson} / {totalLessons}
      </p>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!canGoBack}
          onClick={onBack}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        <Button type="button" disabled={!canGoNext} onClick={onNext}>
          Next
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </footer>
  )
}
