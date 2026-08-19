import { Link } from '@tanstack/react-router'

import type { BlogPost } from '../blog'
import { formatPostDate } from '../blog'

export function BlogPostList({
  posts,
}: {
  posts: ReadonlyArray<BlogPost>
}) {
  return (
    <div className="divide-y divide-border">
      {posts.map((post) => (
        <Link
          key={post.slug}
          to="/blog/$slug"
          params={{ slug: post.slug }}
          className="group grid gap-5 py-8 outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center"
        >
          {post.image ? (
            <img
              src={post.image}
              alt={post.imageAlt ?? ''}
              className="aspect-4/3 w-full rounded-lg border border-border object-cover"
              loading="lazy"
            />
          ) : null}
          <div className={post.image ? undefined : 'sm:col-span-2'}>
            <p className="text-sm text-muted-foreground">
              {formatPostDate(post.postedOn)}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight underline-offset-4 transition-colors group-hover:text-navy-600 group-hover:underline">
              {post.title}
            </h2>
            <p className="mt-2 text-base/7 text-foreground/70">
              {post.description}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}
