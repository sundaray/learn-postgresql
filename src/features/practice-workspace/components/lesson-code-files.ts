import type { FileContents, FileOptions } from '@pierre/diffs'

import type {
  LessonContentBlock,
  LessonPlan,
} from '@/features/lessons'

export const lessonCodeFileOptions = {
  theme: 'night-owl',
  disableFileHeader: true,
  overflow: 'scroll',
} as const satisfies FileOptions<undefined>

export type LessonCodeBlockPreloads = Readonly<Record<string, string>>

export function getLessonContentCodeFileName(
  prefix: string,
  blockIndex: number,
  language: 'sql' | 'text',
) {
  return `${prefix}-${blockIndex + 1}.${language === 'sql' ? 'sql' : 'txt'}`
}

export function getLessonStepCodeFileName(
  lessonSlug: string,
  stepId: string,
) {
  return `${lessonSlug}-${stepId}.sql`
}

function appendContentCodeFiles(
  files: FileContents[],
  blocks: LessonContentBlock[] | undefined,
  prefix: string,
) {
  blocks?.forEach((block, blockIndex) => {
    if (block.type !== 'code') return

    files.push({
      name: getLessonContentCodeFileName(
        prefix,
        blockIndex,
        block.language,
      ),
      contents: block.contents,
    })
  })
}

/** Returns the exact files the lesson panel passes to Pierre's File component. */
export function getLessonCodeFiles(lesson: LessonPlan): FileContents[] {
  const files: FileContents[] = []

  appendContentCodeFiles(
    files,
    lesson.content,
    `${lesson.slug}-introduction`,
  )

  lesson.sections?.forEach((section, sectionIndex) => {
    appendContentCodeFiles(
      files,
      section.content,
      `${lesson.slug}-section-${sectionIndex + 1}`,
    )
  })

  lesson.steps?.forEach((step) => {
    if (!step.sql) return

    files.push({
      name: getLessonStepCodeFileName(lesson.slug, step.id),
      contents: step.sql,
    })
  })

  return files
}
