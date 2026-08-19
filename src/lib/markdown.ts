import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

/**
 * A rendered post is a list of segments rather than one HTML string, because
 * fenced code blocks are handed to the same Pierre code block the lessons use
 * instead of being written out as plain `<pre>`.
 */
export type MarkdownSegment =
  | { type: 'html'; html: string }
  | { type: 'code'; name: string; contents: string }

type CodeBlock = { name: string; contents: string }

/** Marks where a code block was lifted out, so the HTML can be split on it. */
const CODE_MARKER_PREFIX = 'code-block:'

/** Pierre reads the language off the file name, the way the lessons do. */
const codeFileExtensions: Record<string, string> = {
  bash: 'sh',
  css: 'css',
  html: 'html',
  javascript: 'js',
  js: 'js',
  json: 'json',
  jsx: 'jsx',
  markdown: 'md',
  md: 'md',
  postgres: 'sql',
  postgresql: 'sql',
  psql: 'sql',
  sh: 'sh',
  shell: 'sh',
  sql: 'sql',
  text: 'txt',
  toml: 'toml',
  ts: 'ts',
  tsx: 'tsx',
  txt: 'txt',
  typescript: 'ts',
  yaml: 'yaml',
  yml: 'yaml',
}

interface HastRoot {
  type: string
}

interface HastElement {
  type: 'element'
  tagName: string
  properties?: {
    className?: unknown
  }
  children?: unknown[]
}

interface HastText {
  type: 'text'
  value: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isElementNode(node: unknown): node is HastElement {
  return (
    isRecord(node) &&
    node.type === 'element' &&
    typeof node.tagName === 'string'
  )
}

function isTextNode(node: unknown): node is HastText {
  return isRecord(node) && node.type === 'text' && typeof node.value === 'string'
}

function hasChildren(node: unknown): node is { children: unknown[] } {
  return isRecord(node) && Array.isArray(node.children)
}

function isTableWrapperElement(node: unknown) {
  if (!isElementNode(node) || node.tagName !== 'div') return false

  const className = node.properties?.className

  return Array.isArray(className) && className.includes('table-wrapper')
}

function rehypeWrapTables() {
  return (tree: HastRoot) => {
    visit(tree, (node: unknown, index: number | undefined, parent: unknown) => {
      if (!isElementNode(node) || node.tagName !== 'table') return
      if (isTableWrapperElement(parent)) return SKIP
      if (typeof index !== 'number' || !hasChildren(parent)) return

      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-wrapper'] },
        children: [node],
      }

      return SKIP
    })
  }
}

function readElementText(node: unknown): string {
  if (isTextNode(node)) return node.value
  if (hasChildren(node)) {
    return node.children.map((child) => readElementText(child)).join('')
  }

  return ''
}

function readFenceLanguage(codeElement: HastElement): string {
  const className = codeElement.properties?.className

  if (!Array.isArray(className)) return ''

  for (const entry of className) {
    if (typeof entry === 'string' && entry.startsWith('language-')) {
      return entry.slice('language-'.length).toLowerCase()
    }
  }

  return ''
}

function buildCodeFileName(
  namePrefix: string,
  blockIndex: number,
  language: string,
) {
  const extension = codeFileExtensions[language] ?? 'txt'

  return `${namePrefix}-${blockIndex + 1}.${extension}`
}

/**
 * Replaces every top-level fenced code block with a comment marker and records
 * the code it held. Blocks nested inside a list or a quote are left alone: they
 * would land outside their parent once the HTML is split, so they stay plain
 * `<pre>` and are styled by the prose rules.
 */
function rehypeExtractCodeBlocks(codeBlocks: CodeBlock[], namePrefix: string) {
  return (tree: HastRoot) => {
    visit(tree, (node: unknown, index: number | undefined, parent: unknown) => {
      if (!isElementNode(node) || node.tagName !== 'pre') return
      if (!isRecord(parent) || parent.type !== 'root') return
      if (typeof index !== 'number' || !hasChildren(parent)) return

      const codeElement = node.children?.find(
        (child) => isElementNode(child) && child.tagName === 'code',
      )

      if (!isElementNode(codeElement)) return

      const blockIndex = codeBlocks.length

      codeBlocks.push({
        name: buildCodeFileName(
          namePrefix,
          blockIndex,
          readFenceLanguage(codeElement),
        ),
        // remark adds a closing newline that the code block would render as an
        // empty last line.
        contents: readElementText(codeElement).replace(/\n$/, ''),
      })

      parent.children[index] = {
        type: 'comment',
        value: `${CODE_MARKER_PREFIX}${blockIndex}`,
      }

      return SKIP
    })
  }
}

function splitHtmlIntoSegments(
  html: string,
  codeBlocks: CodeBlock[],
): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  const markerPattern = new RegExp(`<!--${CODE_MARKER_PREFIX}(\\d+)-->`, 'g')
  let readFrom = 0

  for (const match of html.matchAll(markerPattern)) {
    const markerStart = match.index ?? 0
    const precedingHtml = html.slice(readFrom, markerStart)

    if (precedingHtml.trim()) {
      segments.push({ type: 'html', html: precedingHtml })
    }

    const blockIndex = match[1]
    const codeBlock =
      blockIndex === undefined ? undefined : codeBlocks[Number(blockIndex)]

    if (codeBlock) {
      segments.push({
        type: 'code',
        name: codeBlock.name,
        contents: codeBlock.contents,
      })
    }

    readFrom = markerStart + match[0].length
  }

  const remainingHtml = html.slice(readFrom)

  if (remainingHtml.trim()) {
    segments.push({ type: 'html', html: remainingHtml })
  }

  return segments
}

/**
 * Renders post markdown at build time. `namePrefix` becomes the file name each
 * code block is highlighted under, so it has to be unique per post.
 */
export async function renderMarkdownToSegments(
  markdown: string,
  namePrefix: string,
): Promise<MarkdownSegment[]> {
  const codeBlocks: CodeBlock[] = []

  const rendered = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeWrapTables)
    .use(rehypeExtractCodeBlocks, codeBlocks, namePrefix)
    .use(rehypeStringify)
    .process(markdown)

  return splitHtmlIntoSegments(String(rendered), codeBlocks)
}
