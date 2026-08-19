import { Link, createFileRoute } from '@tanstack/react-router'

import { MainNavbar } from '@/components/main-navbar'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import {
  LessonTitle,
  getLessonNumbersWithinCategory,
  postgresqlCourse,
} from '@/features/lessons'

export const Route = createFileRoute('/lessons/')({
  head: () => ({
    meta: [
      { title: 'PostgreSQL Lessons | Learn PostgreSQL' },
      {
        name: 'description',
        content:
          'Hands-on PostgreSQL lessons you run in the browser, covering execution plans, indexes, and pagination.',
      },
    ],
  }),
  component: LessonsIndex,
})

function LessonsIndex() {
  const lessons = postgresqlCourse.lessons
  const categories = [
    ...new Set(lessons.map((lesson) => lesson.category ?? 'PostgreSQL')),
  ]
  const lessonNumbers = getLessonNumbersWithinCategory(lessons, 'PostgreSQL')

  return (
    <>
      <MainNavbar />

      <main className="mx-auto mt-16 flex max-w-3xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col gap-3">
          <PageBreadcrumbs trail={['Lessons']} />
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Lessons
          </h1>
          <p className="text-lg leading-7 text-foreground/70">
            Every lesson runs against a real PostgreSQL database in your
            browser.
          </p>
        </header>

        <nav aria-label="PostgreSQL lessons" className="flex flex-col gap-8">
          {categories.map((category) => (
            <section key={category} className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-navy-600">
                {category}
              </h2>
              <ol className="flex flex-col gap-3">
                {lessons.map((lesson, lessonIndex) => {
                  if ((lesson.category ?? 'PostgreSQL') !== category) {
                    return null
                  }

                  return (
                    <li key={lesson.id}>
                      <Link
                        to="/lessons/$lessonSlug"
                        params={{ lessonSlug: lesson.slug }}
                        className="group flex gap-3 py-1 transition-colors hover:text-navy-600"
                      >
                        <span className="text-muted-foreground">
                          {lessonNumbers[lessonIndex]}.
                        </span>
                        <span className="font-normal underline-offset-2 group-hover:underline">
                          <LessonTitle title={lesson.title} />
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </nav>
      </main>
    </>
  )
}
