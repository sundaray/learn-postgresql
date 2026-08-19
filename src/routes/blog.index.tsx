import { createFileRoute } from '@tanstack/react-router'
import { allBlogPosts } from 'content-collections'

import { MainNavbar } from '@/components/main-navbar'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { BlogPostList, sortPostsByNewest } from '@/features/blog'
import { SITE_NAME, SITE_URL } from '@/lib/site'

const BLOG_DESCRIPTION = 'Notes on PostgreSQL'

/** Sorted once at module scope: the posts are fixed at build time. */
const sortedPosts = sortPostsByNewest(allBlogPosts)

export const Route = createFileRoute('/blog/')({
  head: () => ({
    meta: [
      { title: `Blog | ${SITE_NAME}` },
      { name: 'description', content: BLOG_DESCRIPTION },
    ],
    links: [{ rel: 'canonical', href: `${SITE_URL}/blog` }],
  }),
  component: BlogIndex,
})

function BlogIndex() {
  return (
    <>
      <MainNavbar />

      <main className="mx-auto mt-16 flex max-w-3xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col gap-3">
          <PageBreadcrumbs trail={['Blog']} />
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Blog</h1>
          <p className="text-lg leading-7 text-foreground/70">
            {BLOG_DESCRIPTION}
          </p>
        </header>

        {sortedPosts.length > 0 ? (
          <BlogPostList posts={sortedPosts} />
        ) : (
          <p className="text-muted-foreground">Posts are on the way.</p>
        )}
      </main>
    </>
  )
}
