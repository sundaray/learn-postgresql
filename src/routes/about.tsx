import { createFileRoute } from '@tanstack/react-router'

import { MainNavbar } from '@/components/main-navbar'
import { SITE_NAME, SITE_URL } from '@/lib/site'

const ABOUT_DESCRIPTION =
  'Hemanta Sundaray on why this site exists: studying PostgreSQL seriously and writing down what he learns.'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: `About | ${SITE_NAME}` },
      { name: 'description', content: ABOUT_DESCRIPTION },
    ],
    links: [{ rel: 'canonical', href: `${SITE_URL}/about` }],
  }),
  component: AboutPage,
})

function AboutPage() {
  return (
    <>
      <MainNavbar />

      <main className="mx-auto mt-16 flex max-w-3xl flex-col gap-10 px-6 py-16">
        {/*
          The portrait the blog posts show, at 1.5x their size because here it
          carries the top of the page on its own rather than sitting beside a
          byline.
        */}
        <img
          src="/images/hemanta-sundaray.jpg"
          alt="Hemanta Sundaray"
          width={256}
          height={256}
          className="size-16.5 shrink-0 rounded-full object-cover ring-1 ring-border ring-offset-2 ring-offset-background"
        />

        <div className="flex flex-col gap-6 text-lg leading-8 text-foreground/80">
          <p>
            Hello! I’m Hemanta Sundaray, a full-stack developer working
            primarily with TypeScript, React, Node.js, and PostgreSQL.
          </p>
          <p>
            I have been using PostgreSQL for years, but I never really took the
            time to understand databases at a deeper level. As a result, I often
            did not feel confident when database-related questions came up in
            technical interviews.
          </p>
          <p>I wanted to change that.</p>
          <p>
            So I started studying PostgreSQL more seriously, researching the
            concepts I did not understand well, experimenting with them, and
            writing about what I learned. This website is where I document that
            process.
          </p>
          <p>
            My goal is to understand PostgreSQL deeply enough that I can reason
            about it with confidence, not just use it.
          </p>
          <p>
            Hopefully, the material here helps you do the same, so you can make
            better use of PostgreSQL and grow as a software engineer.
          </p>
          <p>
            Cheers!
            <br />
            Hemanta
          </p>
        </div>
      </main>
    </>
  )
}
