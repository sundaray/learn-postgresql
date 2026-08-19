import { defineCollection, defineConfig } from '@content-collections/core'
import { z as zod } from 'zod'

import { renderMarkdownToSegments } from './src/lib/markdown'
import { SITE_AUTHOR } from './src/lib/site'

const blogPostSchema = zod.object({
  title: zod.string(),
  description: zod.string().optional(),
  postedOn: zod.string().date(),
  updatedOn: zod.string().date().optional(),
  categories: zod.array(zod.string()).min(1),
  author: zod.string().optional(),
  image: zod.string().optional(),
  imageAlt: zod.string().optional(),
  content: zod.string(),
})

const blogPosts = defineCollection({
  name: 'blogPosts',
  directory: './src/content/blog',
  include: '*.md',
  schema: blogPostSchema,
  transform: async (document) => ({
    title: document.title,
    description: document.description ?? null,
    postedOn: document.postedOn,
    updatedOn: document.updatedOn ?? null,
    categories: document.categories,
    author: document.author ?? SITE_AUTHOR,
    image: document.image ?? null,
    imageAlt: document.imageAlt ?? null,
    slug: document._meta.path,
    segments: await renderMarkdownToSegments(
      document.content,
      document._meta.path,
    ),
  }),
})

export default defineConfig({
  content: [blogPosts],
})
