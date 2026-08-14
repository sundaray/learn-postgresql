import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'

import {
  findLessonBySlug,
  getLessonDescription,
  postgresqlCourse,
} from '@/features/lessons'
import { PracticeWorkspace } from '@/features/practice-workspace'

export const Route = createFileRoute('/lessons/$lessonSlug')({
  // An unknown slug must answer 404 rather than quietly render lesson one,
  // so search engines never index the same lesson under invented URLs.
  beforeLoad: ({ params }) => {
    if (!findLessonBySlug(postgresqlCourse.slug, params.lessonSlug)) {
      throw notFound()
    }
  },
  head: ({ params }) => {
    const lesson = findLessonBySlug(postgresqlCourse.slug, params.lessonSlug)

    if (!lesson) {
      return {}
    }

    const description = getLessonDescription(lesson)

    return {
      meta: [
        { title: `${lesson.title} | Learn PostgreSQL` },
        ...(description ? [{ name: 'description', content: description }] : []),
      ],
    }
  },
  component: LessonWorkspace,
})

function LessonWorkspace() {
  const { lessonSlug } = Route.useParams()
  const navigate = useNavigate()

  return (
    <PracticeWorkspace
      lessonSlug={lessonSlug}
      onOpenLesson={(nextLessonSlug) => {
        void navigate({
          to: '/lessons/$lessonSlug',
          params: { lessonSlug: nextLessonSlug },
        })
      }}
    />
  )
}
