type LessonCategory = {
  category?: string
}

/**
 * Numbers every lesson inside its own sub chapter, so each sub chapter starts
 * at 1 instead of continuing the course-wide count. The returned numbers line
 * up with the lessons that were passed in.
 */
export function getLessonNumbersWithinCategory(
  lessons: readonly LessonCategory[],
  fallbackCategory: string,
): number[] {
  const lessonCounts = new Map<string, number>()

  return lessons.map((lesson) => {
    const category = lesson.category ?? fallbackCategory
    const lessonNumber = (lessonCounts.get(category) ?? 0) + 1

    lessonCounts.set(category, lessonNumber)

    return lessonNumber
  })
}
