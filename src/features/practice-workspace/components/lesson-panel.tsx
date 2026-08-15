import { Link } from '@tanstack/react-router'
import {
  CheckCircle2Icon,
  Code2Icon,
  InfoIcon,
  LightbulbIcon,
  MessageCircleQuestionIcon,
  TargetIcon,
  TriangleAlertIcon,
} from 'lucide-react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type {
  LessonContentBlock,
  LessonFormat,
  LessonPlan,
  LessonStepPlan,
} from '@/features/lessons'
import { cn } from '@/lib/utils'

import { practiceWorkspaceConfig } from '../data/workspace-config'

import { LessonCodeBlock } from './lesson-code-block'
import {
  getLessonContentCodeFileName,
  getLessonStepCodeFileName,
} from './lesson-code-files'
import { LessonDiagram } from './lesson-diagram'
import { LessonRichText } from './lesson-rich-text'

const lessonFormatLabels: Record<LessonFormat, string> = {
  'guided-lab': 'Guided lab',
  'concept-lab': 'Concept lab',
  challenge: 'Challenge',
}

// The same blue the home page puts on "PostgreSQL".
const breadcrumbLinkClassName =
  'text-navy-600 underline-offset-4 hover:text-navy-600 hover:underline'

/** The tilted slash the other apps use between breadcrumb crumbs. */
function BreadcrumbSlashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 5 5 19" transform="rotate(-10 12 12)" />
    </svg>
  )
}

type LessonPanelProps = {
  lesson: LessonPlan
  activeStepId: string | null
  onLoadStep: (step: LessonStepPlan) => void
  onLoadSnippet: (sql: string) => void
}

type LessonContentBlocksProps = {
  blocks: LessonContentBlock[]
  codeNamePrefix: string
  onLoadSnippet: (sql: string) => void
}

function LessonContentBlocks({
  blocks,
  codeNamePrefix,
  onLoadSnippet,
}: LessonContentBlocksProps) {
  return (
    <div className="flex flex-col gap-4 text-base leading-7">
      {blocks.map((block, blockIndex) => {
        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${blockIndex}`}>
              <LessonRichText text={block.text} />
            </p>
          )
        }

        if (block.type === 'note') {
          return (
            <aside
              key={`note-${blockIndex}`}
              className="flex gap-3 rounded-lg border border-navy-600/25 bg-navy-600/8 px-4 py-3"
            >
              <InfoIcon className="mt-1 size-4 shrink-0 text-navy-600" />
              <p>
                <span className="font-semibold text-navy-600">Note:</span>{' '}
                <LessonRichText text={block.text} />
              </p>
            </aside>
          )
        }

        if (
          block.type === 'unordered-list' ||
          block.type === 'ordered-list'
        ) {
          const List = block.type === 'ordered-list' ? 'ol' : 'ul'

          return (
            <List
              key={`${block.type}-${blockIndex}`}
              className={cn(
                'flex flex-col gap-3 pl-6 marker:font-medium marker:text-foreground',
                block.type === 'ordered-list' ? 'list-decimal' : 'list-disc',
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1">
                  <div className="flex flex-col gap-3">
                    {item.paragraphs.map((paragraph, paragraphIndex) => (
                      <p key={paragraphIndex}>
                        <LessonRichText text={paragraph} />
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </List>
          )
        }

        // Only SQL snippets can be sent to the editor; the text blocks are
        // sample output.
        if (block.language !== 'sql') {
          return (
            <LessonCodeBlock
              key={`code-${blockIndex}`}
              name={getLessonContentCodeFileName(
                codeNamePrefix,
                blockIndex,
                block.language,
              )}
              contents={block.contents}
            />
          )
        }

        return (
          <LessonCodeBlock
            key={`code-${blockIndex}`}
            name={getLessonContentCodeFileName(
              codeNamePrefix,
              blockIndex,
              block.language,
            )}
            contents={block.contents}
            onLoadInEditor={() => onLoadSnippet(block.contents)}
          />
        )
      })}
    </div>
  )
}

export function LessonPanel({
  activeStepId,
  lesson,
  onLoadSnippet,
  onLoadStep,
}: LessonPanelProps) {
  return (
    <section className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex shrink-0 items-center border-b px-5 py-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                className={breadcrumbLinkClassName}
                render={<Link to="/" />}
              >
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <BreadcrumbSlashIcon />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink
                className={breadcrumbLinkClassName}
                render={<Link to="/lessons" />}
              >
                Lessons
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <BreadcrumbSlashIcon />
            </BreadcrumbSeparator>
            {/* The chapter groups related lessons; it has no page of its own. */}
            <BreadcrumbItem>
              <BreadcrumbPage>{practiceWorkspaceConfig.appName}</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <BreadcrumbSlashIcon />
            </BreadcrumbSeparator>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Keyed on the lesson so a shorter one is measured for overflow afresh
          rather than inheriting the previous lesson's scrollbar. */}
      <ScrollArea
        key={lesson.slug}
        className="min-h-0 flex-1"
        viewportClassName="scroll-fade"
      >
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
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
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

          {lesson.content && (
            <LessonContentBlocks
              blocks={lesson.content}
              codeNamePrefix={`${lesson.slug}-introduction`}
              onLoadSnippet={onLoadSnippet}
            />
          )}

          {lesson.sections?.map((section, sectionIndex) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-xl leading-tight font-semibold tracking-tight">
                {section.title}
              </h2>
              {section.paragraphs && (
                <div className="flex flex-col gap-4 text-base leading-7">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>
                      <LessonRichText text={paragraph} />
                    </p>
                  ))}
                </div>
              )}
              {section.content && (
                <LessonContentBlocks
                  blocks={section.content}
                  codeNamePrefix={`${lesson.slug}-section-${sectionIndex + 1}`}
                  onLoadSnippet={onLoadSnippet}
                />
              )}
            </section>
          ))}

          {(lesson.learningObjectives?.length ?? 0) > 0 && (
            <section
              className="flex flex-col gap-3 border-y py-5"
              aria-labelledby="objectives-heading"
            >
              <div className="flex items-center gap-2">
                <TargetIcon className="size-4 text-muted-foreground" />
                <h2 id="objectives-heading" className="text-base font-semibold">
                  Learning objectives
                </h2>
              </div>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-base leading-7 text-muted-foreground marker:text-foreground">
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
              <h2 id="exercises-heading" className="text-base font-semibold">
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

                    <div className="flex flex-col gap-2 text-base leading-7 text-muted-foreground">
                      {step.instruction.map((instruction) => (
                        <p key={instruction}>{instruction}</p>
                      ))}
                    </div>

                    {step.sql && (
                      <div className="flex flex-col gap-2">
                        <LessonCodeBlock
                          name={getLessonStepCodeFileName(
                            lesson.slug,
                            step.id,
                          )}
                          contents={step.sql}
                        />

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
                        <p className="text-base font-semibold">
                          What to look for
                        </p>
                        <ul className="flex list-disc flex-col gap-1 pl-5 text-base leading-7 text-muted-foreground marker:text-foreground">
                          {step.expectedObservations.map((observation) => (
                            <li key={observation}>{observation}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {step.explanation.length > 0 && (
                      <div className="flex flex-col gap-2 border-t pt-3">
                        <p className="text-base font-semibold">Why it matters</p>
                        {step.explanation.map((paragraph) => (
                          <p
                            key={paragraph}
                            className="text-base leading-7 text-muted-foreground"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}

                    {step.hint && (
                      <aside className="flex gap-2 border-t pt-3 text-base leading-7 text-muted-foreground">
                        <LightbulbIcon className="mt-1 size-4 shrink-0" />
                        <p>{step.hint}</p>
                      </aside>
                    )}

                    {step.caution && (
                      <aside className="flex gap-2 border-t pt-3 text-base leading-7 text-muted-foreground">
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
              <h2 id="takeaways-heading" className="text-base font-semibold">
                Key takeaways
              </h2>
            </div>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-base leading-7 text-muted-foreground marker:text-foreground">
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
                className="text-base font-semibold"
              >
                Interview checks
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              {lesson.interviewChecks?.map((check) => (
                <details key={check.question} className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-base font-medium">
                    {check.question}
                  </summary>
                  <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-base leading-7 text-muted-foreground marker:text-foreground">
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
