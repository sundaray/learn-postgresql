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
