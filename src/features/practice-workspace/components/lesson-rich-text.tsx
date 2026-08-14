import { Fragment } from 'react'
import type { ReactNode } from 'react'

/** Matches `**bold**` or `` `code` `` spans in lesson prose. */
const inlineMarkupPattern = /\*\*([^*]+)\*\*|`([^`]+)`/g

function buildInlineNodes(text: string) {
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(inlineMarkupPattern)) {
    const [matched, boldText, codeText] = match
    const matchIndex = match.index

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex))
    }

    if (boldText !== undefined) {
      nodes.push(
        <strong key={`${matchIndex}`} className="font-semibold">
          {boldText}
        </strong>,
      )
    } else {
      nodes.push(
        <code
          key={`${matchIndex}`}
          className="rounded bg-navy-900/7 px-1.5 py-0.5 font-mono text-[0.85em] text-navy-800"
        >
          {codeText}
        </code>,
      )
    }

    lastIndex = matchIndex + matched.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

type LessonRichTextProps = {
  text: string
}

export function LessonRichText({ text }: LessonRichTextProps) {
  return (
    <>
      {buildInlineNodes(text).map((node, nodeIndex) => (
        <Fragment key={nodeIndex}>{node}</Fragment>
      ))}
    </>
  )
}
