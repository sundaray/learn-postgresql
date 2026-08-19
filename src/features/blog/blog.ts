import { allBlogPosts } from 'content-collections'

export type BlogPost = (typeof allBlogPosts)[number]

export type BlogPostSegment = BlogPost['segments'][number]

export function slugifyCategory(category: string): string {
  return category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatPostDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`)

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function sortPostsByNewest<Post extends { postedOn: string }>(
  posts: ReadonlyArray<Post>,
): Post[] {
  return [...posts].sort((firstPost, secondPost) =>
    secondPost.postedOn.localeCompare(firstPost.postedOn),
  )
}

export function findPostBySlug(slug: string): BlogPost | undefined {
  return allBlogPosts.find((post) => post.slug === slug)
}

export function findPostsByCategorySlug(categorySlug: string): BlogPost[] {
  return allBlogPosts.filter((post) =>
    post.categories.some(
      (category) => slugifyCategory(category) === categorySlug,
    ),
  )
}

/** Recovers the category as it was written, given the slug in the URL. */
export function findCategoryBySlug(
  posts: ReadonlyArray<{ categories: string[] }>,
  categorySlug: string,
): string | undefined {
  for (const post of posts) {
    const category = post.categories.find(
      (postCategory) => slugifyCategory(postCategory) === categorySlug,
    )

    if (category) return category
  }

  return undefined
}
