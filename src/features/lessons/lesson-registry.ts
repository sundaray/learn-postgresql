import type { CoursePlan, LessonPlan } from './model/lesson-plan.types'

import { postgresqlCourse } from './content/postgresql'

export const lessonCourses: CoursePlan[] = [postgresqlCourse]

export function findCourseBySlug(courseSlug: string): CoursePlan | undefined {
  return lessonCourses.find((course) => course.slug === courseSlug)
}

export function findLessonBySlug(
  courseSlug: string,
  lessonSlug: string,
): LessonPlan | undefined {
  return findCourseBySlug(courseSlug)?.lessons.find(
    (lesson) => lesson.slug === lessonSlug,
  )
}

/**
 * The one line that stands in for a lesson in link lists and meta tags. Lesson
 * prose is written with markdown emphasis, which has to come off before the
 * text is shown outside a lesson panel.
 */
export function getLessonDescription(lesson: LessonPlan): string | undefined {
  const description = lesson.summary ?? lesson.introduction[0]

  return description?.replace(/[*`_]/g, '')
}
