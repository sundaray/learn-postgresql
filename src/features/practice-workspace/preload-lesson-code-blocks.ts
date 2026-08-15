import { preloadFile } from '@pierre/diffs/ssr'
import { createServerFn } from '@tanstack/react-start'

import {
  findLessonBySlug,
  postgresqlCourse,
} from '@/features/lessons'

import {
  getLessonCodeFiles,
  lessonCodeFileOptions,
} from './components/lesson-code-files'

function validateLessonSlug(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('A lesson slug is required.')
  }

  const lessonSlug = Reflect.get(input, 'lessonSlug')

  if (typeof lessonSlug !== 'string' || !lessonSlug) {
    throw new Error('A lesson slug is required.')
  }

  return { lessonSlug }
}

/**
 * Produces Pierre's initial Shadow DOM markup on the server. Client-side route
 * changes call this same server function, so a lesson never mounts empty.
 */
export const preloadLessonCodeBlocks = createServerFn({ method: 'GET' })
  .validator(validateLessonSlug)
  .handler(async ({ data }) => {
    const lesson = findLessonBySlug(postgresqlCourse.slug, data.lessonSlug)

    if (!lesson) return {}

    const preloadedFiles = await Promise.all(
      getLessonCodeFiles(lesson).map((file) =>
        preloadFile({ file, options: lessonCodeFileOptions }),
      ),
    )

    return Object.fromEntries(
      preloadedFiles.map(({ file, prerenderedHTML }) => [
        file.name,
        prerenderedHTML,
      ]),
    )
  })
