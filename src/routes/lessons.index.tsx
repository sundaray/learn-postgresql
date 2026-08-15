import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { SiteMenu } from '@/components/site-menu'
import { postgresqlCourse } from '@/features/lessons'

export const Route = createFileRoute('/lessons/')({
  head: () => ({
    meta: [
      { title: 'PostgreSQL Lessons | Learn PostgreSQL' },
      {
        name: 'description',
        content:
          'Hands-on PostgreSQL lessons you run in the browser, from how a statement is executed to reading execution plans.',
      },
    ],
  }),
  component: LessonsIndex,
})

function LessonsIndex() {
  const lessons = postgresqlCourse.lessons

  return (
    <main className="mx-auto mt-16 flex max-w-3xl flex-col gap-10 px-6 py-16">
      <SiteMenu />

      <header className="flex flex-col gap-3">
        <Link
          to="/"
          className="group flex w-fit items-center gap-2 text-sm text-foreground/70 transition-colors hover:text-navy-600"
        >
          <ArrowLeft
            aria-hidden
            className="size-4 transition-transform duration-200 ease-out group-hover:-translate-x-1"
          />
          Home
        </Link>
        <h1 className="text-4xl font-semibold tracking-tight">Lessons</h1>
        <p className="text-lg leading-7 text-foreground/70">
          Every lesson runs against a real PostgreSQL database in your browser.
        </p>
      </header>

      <nav aria-label="PostgreSQL lessons" className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-navy-600">
          Indexes
        </h2>
        <ol className="flex flex-col gap-3">
          {lessons.map((lesson, lessonIndex) => (
            <li key={lesson.id}>
              <Link
                to="/lessons/$lessonSlug"
                params={{ lessonSlug: lesson.slug }}
                className="group flex gap-3 py-1 transition-colors hover:text-navy-600"
              >
                <span className="text-muted-foreground">
                  {lessonIndex + 1}.
                </span>
                <span className="font-normal underline-offset-2 group-hover:underline">
                  {lesson.title}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </main>
  )
}
