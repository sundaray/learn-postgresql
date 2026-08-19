import { createFileRoute, notFound } from '@tanstack/react-router'
import { allBlogPosts } from 'content-collections'

import { MainNavbar } from '@/components/main-navbar'
import {
  BackToBlogLink,
  BlogPostList,
  findCategoryBySlug,
  findPostsByCategorySlug,
  sortPostsByNewest,
} from '@/features/blog'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const Route = createFileRoute('/blog/tags/$tag')({
  // A tag nobody has used must answer 404 rather than render an empty page.
  beforeLoad: ({ params }) => {
    if (findPostsByCategorySlug(params.tag).length === 0) {
      throw notFound()
    }
  },
  head: ({ params }) => {
    const categoryName = findCategoryBySlug(allBlogPosts, params.tag)

    if (!categoryName) {
      return {}
    }

    return {
      meta: [
        { title: `${categoryName} | ${SITE_NAME}` },
        { name: 'description', content: `Posts about ${categoryName}.` },
      ],
      links: [{ rel: 'canonical', href: `${SITE_URL}/blog/tags/${params.tag}` }],
    }
  },
  component: BlogTagPage,
})

function BlogTagPage() {
  const { tag } = Route.useParams()
  const categoryName = findCategoryBySlug(allBlogPosts, tag)
  const posts = sortPostsByNewest(findPostsByCategorySlug(tag))

  return (
    <>
      <MainNavbar />

      <main className="mx-auto mt-16 flex max-w-3xl flex-col gap-10 px-6 py-16">
        <header className="flex flex-col gap-3">
          <BackToBlogLink />
          <h1 className="text-4xl font-semibold tracking-tight">
            {posts.length} {posts.length === 1 ? 'post' : 'posts'} tagged “
            {categoryName}”
          </h1>
        </header>

        <BlogPostList posts={posts} />
      </main>
    </>
  )
}
