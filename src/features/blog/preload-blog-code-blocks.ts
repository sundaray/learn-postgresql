import { preloadFile } from '@pierre/diffs/ssr'
import { createServerFn } from '@tanstack/react-start'

import { buildCodeBlockFileOptions } from '@/components/code-block-options'

import { findPostBySlug } from './blog'

function validatePostSlug(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('A blog post slug is required.')
  }

  const slug = Reflect.get(input, 'slug')

  if (typeof slug !== 'string' || !slug) {
    throw new Error('A blog post slug is required.')
  }

  return { slug }
}

/**
 * Highlights a post's code blocks on the server, the way the lessons do, so
 * Shiki never reaches the browser bundle and a post never mounts unhighlighted.
 */
export const preloadBlogCodeBlocks = createServerFn({ method: 'GET' })
  .validator(validatePostSlug)
  .handler(async ({ data }) => {
    const post = findPostBySlug(data.slug)

    if (!post) return {}

    const preloadedFiles = await Promise.all(
      post.segments
        .filter((segment) => segment.type === 'code')
        .map((segment) =>
          preloadFile({
            file: { name: segment.name, contents: segment.contents },
            options: buildCodeBlockFileOptions(segment.highlights),
          }),
        ),
    )

    return Object.fromEntries(
      preloadedFiles.map(({ file, prerenderedHTML }) => [
        file.name,
        prerenderedHTML,
      ]),
    )
  })
