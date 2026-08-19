import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { CodeBlockPreloadProvider } from '@/components/code-block'
import { MainNavbar } from '@/components/main-navbar'
import {
  BlogBreadcrumbs,
  BlogPostContent,
  findPostBySlug,
  formatPostDate,
  preloadBlogCodeBlocks,
  slugifyCategory,
} from '@/features/blog'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const Route = createFileRoute('/blog/$slug')({
  // An unknown slug must answer 404 rather than quietly render something else,
  // so search engines never index a post under an invented URL.
  beforeLoad: ({ params }) => {
    if (!findPostBySlug(params.slug)) {
      throw notFound()
    }
  },
  loader: ({ params }) => preloadBlogCodeBlocks({ data: { slug: params.slug } }),
  head: ({ params }) => {
    const post = findPostBySlug(params.slug)

    if (!post) {
      return {}
    }

    const canonicalUrl = `${SITE_URL}/blog/${post.slug}`
    const imageUrl = post.image ? `${SITE_URL}${post.image}` : null

    return {
      meta: [
        { title: `${post.title} | ${SITE_NAME}` },
        ...(post.description
          ? [
              { name: 'description', content: post.description },
              { property: 'og:description', content: post.description },
            ]
          : []),
        { property: 'og:title', content: post.title },
        { property: 'og:type', content: 'article' },
        { property: 'og:url', content: canonicalUrl },
        { property: 'article:published_time', content: post.postedOn },
        ...(post.updatedOn
          ? [{ property: 'article:modified_time', content: post.updatedOn }]
          : []),
        ...(imageUrl
          ? [
              { property: 'og:image', content: imageUrl },
              { property: 'og:image:alt', content: post.imageAlt ?? post.title },
              { name: 'twitter:card', content: 'summary_large_image' },
              { name: 'twitter:image', content: imageUrl },
            ]
          : []),
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            ...(post.description ? { description: post.description } : {}),
            ...(imageUrl ? { image: [imageUrl] } : {}),
            datePublished: post.postedOn,
            dateModified: post.updatedOn ?? post.postedOn,
            author: {
              '@type': 'Person',
              name: post.author,
            },
            publisher: {
              '@type': 'Organization',
              name: SITE_NAME,
              logo: {
                '@type': 'ImageObject',
                url: `${SITE_URL}/favicon-512.png`,
              },
            },
            mainEntityOfPage: {
              '@type': 'WebPage',
              '@id': canonicalUrl,
            },
            keywords: post.categories.join(', '),
            inLanguage: 'en',
            isAccessibleForFree: true,
          },
        },
      ],
      links: [{ rel: 'canonical', href: canonicalUrl }],
    }
  },
  component: BlogPostPage,
})

function BlogPostPage() {
  const { slug } = Route.useParams()
  const codeBlockPreloads = Route.useLoaderData()
  const post = findPostBySlug(slug)

  if (!post) {
    return null
  }

  return (
    <>
      <MainNavbar />

      <main className="mx-auto mt-16 flex max-w-3xl flex-col gap-10 px-6 py-16">
        <article>
          <header className="flex flex-col gap-3">
            <BlogBreadcrumbs />
            <h1 className="mt-3 text-pretty text-4xl font-semibold tracking-tight">
              {post.title}
            </h1>
            <div className="mt-1 flex items-center gap-3">
              <img
                src="/images/hemanta-sundaray.jpg"
                alt=""
                width={256}
                height={256}
                className="size-11 shrink-0 rounded-full object-cover ring-1 ring-border ring-offset-2 ring-offset-background"
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {post.author}
                </span>
                <span aria-hidden="true">·</span>
                <span>Posted on {formatPostDate(post.postedOn)}</span>
                {post.updatedOn ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Updated on {formatPostDate(post.updatedOn)}</span>
                  </>
                ) : null}
              </div>
            </div>
            {post.image ? (
              <img
                src={post.image}
                alt={post.imageAlt ?? ''}
                className="mt-5 w-full rounded-lg border border-border"
                fetchPriority="high"
              />
            ) : null}
          </header>

          <div className="mt-10">
            <CodeBlockPreloadProvider preloads={codeBlockPreloads}>
              <BlogPostContent segments={post.segments} />
            </CodeBlockPreloadProvider>
          </div>

          <footer className="mt-12 border-t border-border pt-6">
            <ul className="flex flex-wrap gap-2">
              {post.categories.map((category) => (
                <li key={category}>
                  <Link
                    to="/blog/tags/$tag"
                    params={{ tag: slugifyCategory(category) }}
                    className="inline-flex items-center rounded-full border border-border px-3 py-1 text-sm font-medium text-foreground/70 transition-colors hover:border-navy-600/30 hover:text-navy-600"
                  >
                    {category}
                  </Link>
                </li>
              ))}
            </ul>
          </footer>
        </article>
      </main>
    </>
  )
}
