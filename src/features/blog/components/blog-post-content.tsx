import { CodeBlock } from '@/components/code-block'

import type { BlogPostSegment } from '../blog'

/**
 * Renders a post body. Prose runs come through as HTML built at build time;
 * code blocks are handed to the same component the lessons use, so a query in
 * a post looks like a query in a lesson.
 */
export function BlogPostContent({
  segments,
}: {
  segments: ReadonlyArray<BlogPostSegment>
}) {
  return (
    <div className="prose">
      {segments.map((segment, segmentIndex) =>
        segment.type === 'code' ? (
          <div key={segment.name} className="mt-6 first:mt-0">
            <CodeBlock name={segment.name} contents={segment.contents} />
          </div>
        ) : (
          <div
            key={`html-${segmentIndex}`}
            dangerouslySetInnerHTML={{ __html: segment.html }}
          />
        ),
      )}
    </div>
  )
}
