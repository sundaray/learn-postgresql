import type { FileOptions } from '@pierre/diffs'

/**
 * Shared by every code block on the site, so a snippet in a blog post is
 * highlighted exactly like the same snippet in a lesson.
 */
export const codeBlockFileOptions = {
  theme: 'night-owl',
  disableFileHeader: true,
  overflow: 'scroll',
} as const satisfies FileOptions<undefined>

/** Pierre's server-rendered markup, keyed by code block file name. */
export type CodeBlockPreloads = Readonly<Record<string, string>>
