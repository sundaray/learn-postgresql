import {
  BookOpenIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CheckCircle2Icon,
  ClipboardIcon,
  Code2Icon,
  LightbulbIcon,
  MessageCircleQuestionIcon,
  TargetIcon,
  TriangleAlertIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type {
  LessonFormat,
  LessonPlan,
  LessonStepPlan,
} from '@/features/lessons'
import { cn } from '@/lib/utils'

import { describeCompletionRule } from '../db/completion'
import type { CompletionCheck } from '../db/completion'

import { LessonCodeBlock } from './lesson-code-block'
import { LessonDiagram } from './lesson-diagram'
import { LessonRichText } from './lesson-rich-text'

const lessonFormatLabels: Record<LessonFormat, string> = {
  'guided-lab': 'Guided lab',
  'concept-lab': 'Concept lab',
  challenge: 'Challenge',
}

type LessonPanelProps = {
  lesson: LessonPlan
  activeStepId: string | null
  onLoadStep: (step: LessonStepPlan) => void
  checks: readonly CompletionCheck[]
  hasRun: boolean
}

export function LessonPanel({
  activeStepId,
  checks,
  hasRun,
  lesson,
  onLoadStep,
}: LessonPanelProps) {
  function copySql(sql: string) {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(sql)
    }
  }

  return (
    <section className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b px-5 py-3 text-sm font-medium">
        <BookOpenIcon className="size-4 text-muted-foreground" />
        Learn
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <article className="flex flex-col gap-8 px-7 py-8">
          <header className="flex flex-col gap-3">
            {lesson.category && (
              <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                {lesson.category}
              </p>
            )}
            <h1 className="max-w-xl text-3xl leading-tight font-semibold tracking-tight">
              {lesson.title}
            </h1>
            {lesson.estimatedMinutes !== undefined && lesson.format && (
              <p className="text-sm text-muted-foreground">
                {lesson.estimatedMinutes} min ·{' '}
                {lessonFormatLabels[lesson.format]}
              </p>
            )}
            {lesson.summary && (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {lesson.summary}
              </p>
            )}
          </header>

          <div className="flex flex-col gap-4 text-base leading-7">
            {lesson.introduction.map((paragraph) => (
              <p key={paragraph}>
                <LessonRichText text={paragraph} />
              </p>
            ))}

            {lesson.introDiagram && (
              <LessonDiagram diagramId={lesson.introDiagram} />
            )}
          </div>

          {lesson.sections?.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-xl leading-tight font-semibold tracking-tight">
                {section.title}
              </h2>
              <div className="flex flex-col gap-4 text-base leading-7">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>
                    <LessonRichText text={paragraph} />
                  </p>
                ))}
              </div>
            </section>
          ))}

          {(lesson.learningObjectives?.length ?? 0) > 0 && (
            <section
              className="flex flex-col gap-3 border-y py-5"
              aria-labelledby="objectives-heading"
            >
              <div className="flex items-center gap-2">
                <TargetIcon className="size-4 text-muted-foreground" />
                <h2 id="objectives-heading" className="text-sm font-semibold">
                  Learning objectives
                </h2>
              </div>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-foreground">
                {lesson.learningObjectives?.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </section>
          )}

          {(lesson.steps?.length ?? 0) > 0 && (
            <section
              className="flex flex-col gap-5"
              aria-labelledby="exercises-heading"
            >
            <div className="flex items-center gap-2 border-b pb-3">
              <CheckCircle2Icon className="size-4" />
              <h2 id="exercises-heading" className="text-sm font-semibold">
                Exercises
              </h2>
            </div>

            {lesson.steps?.map((step) => {
              const isActive = step.id === activeStepId

              return (
                <section
                  key={step.id}
                  className={cn(
                    'grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 rounded-xl border p-4',
                    isActive && 'border-ring bg-muted/30',
                  )}
                  aria-labelledby={`${step.id}-heading`}
                >
                  <div
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full border text-xs font-semibold',
                      isActive && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {step.order}
                  </div>

                  <div className="flex min-w-0 flex-col gap-3 pt-0.5">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground capitalize">
                        {step.kind}
                      </p>
                      <h3 id={`${step.id}-heading`} className="font-medium">
                        {step.title}
                      </h3>
                    </div>

                    <div className="flex flex-col gap-2 text-sm leading-6 text-muted-foreground">
                      {step.instruction.map((instruction) => (
                        <p key={instruction}>{instruction}</p>
                      ))}
                    </div>

                    {step.sql && (
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Copy SQL for ${step.title}`}
                            onClick={() => copySql(step.sql ?? '')}
                          >
                            <ClipboardIcon />
                          </Button>
                        </div>

                        <div className="dark overflow-hidden rounded-lg border bg-background">
                          <LessonCodeBlock
                            name={`${lesson.slug}-${step.id}.sql`}
                            contents={step.sql}
                          />
                        </div>

                        <Button
                          type="button"
                          variant={isActive ? 'secondary' : 'outline'}
                          className="self-start"
                          onClick={() => onLoadStep(step)}
                        >
                          <Code2Icon data-icon="inline-start" />
                          {isActive ? 'Open in editor' : 'Load in editor'}
                        </Button>
                      </div>
                    )}

                    {step.expectedObservations.length > 0 && (
                      <div className="flex flex-col gap-2 border-t pt-3">
                        <p className="text-xs font-semibold">What to look for</p>
                        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground marker:text-foreground">
                          {step.expectedObservations.map((observation) => (
                            <li key={observation}>{observation}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {step.explanation.length > 0 && (
                      <div className="flex flex-col gap-2 border-t pt-3">
                        <p className="text-xs font-semibold">Why it matters</p>
                        {step.explanation.map((paragraph) => (
                          <p
                            key={paragraph}
                            className="text-sm leading-6 text-muted-foreground"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}

                    {isActive && checks.length > 0 && (
                      <div className="flex flex-col gap-2 border-t pt-3">
                        <p className="text-xs font-semibold">
                          Completion checks
                        </p>
                        <ul className="flex flex-col gap-2">
                          {checks.map((check, index) => {
                            const OutcomeIcon =
                              check.outcome === 'met'
                                ? CircleCheckIcon
                                : CircleDashedIcon

                            return (
                              <li
                                key={`${check.rule.kind}-${index}`}
                                className="flex gap-2 text-sm leading-6"
                              >
                                <OutcomeIcon
                                  className={cn(
                                    'mt-1 size-4 shrink-0',
                                    check.outcome === 'met'
                                      ? 'text-foreground'
                                      : 'text-muted-foreground',
                                  )}
                                />
                                <span
                                  className={
                                    check.outcome === 'met'
                                      ? ''
                                      : 'text-muted-foreground'
                                  }
                                >
                                  {hasRun
                                    ? check.detail
                                    : describeCompletionRule(check.rule)}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    {step.hint && (
                      <aside className="flex gap-2 border-t pt-3 text-sm leading-6 text-muted-foreground">
                        <LightbulbIcon className="mt-1 size-4 shrink-0" />
                        <p>{step.hint}</p>
                      </aside>
                    )}

                    {step.caution && (
                      <aside className="flex gap-2 border-t pt-3 text-sm leading-6 text-muted-foreground">
                        <TriangleAlertIcon className="mt-1 size-4 shrink-0" />
                        <p>{step.caution}</p>
                      </aside>
                    )}
                  </div>
                </section>
              )
            })}
            </section>
          )}

          {(lesson.takeaways?.length ?? 0) > 0 && (
            <section
              className="flex flex-col gap-3 border-t pt-6"
              aria-labelledby="takeaways-heading"
            >
            <div className="flex items-center gap-2">
              <LightbulbIcon className="size-4 text-muted-foreground" />
              <h2 id="takeaways-heading" className="text-sm font-semibold">
                Key takeaways
              </h2>
            </div>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-foreground">
              {lesson.takeaways?.map((takeaway) => (
                <li key={takeaway}>{takeaway}</li>
              ))}
            </ul>
            </section>
          )}

          {(lesson.interviewChecks?.length ?? 0) > 0 && (
            <section
              className="flex flex-col gap-3 border-t pt-6"
              aria-labelledby="interview-checks-heading"
            >
            <div className="flex items-center gap-2">
              <MessageCircleQuestionIcon className="size-4 text-muted-foreground" />
              <h2
                id="interview-checks-heading"
                className="text-sm font-semibold"
              >
                Interview checks
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              {lesson.interviewChecks?.map((check) => (
                <details key={check.question} className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {check.question}
                  </summary>
                  <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-foreground">
                    {check.answerPoints.map((answerPoint) => (
                      <li key={answerPoint}>{answerPoint}</li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
            </section>
          )}
        </article>
      </ScrollArea>
    </section>
  )
}
