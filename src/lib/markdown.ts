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
/**
 * The lines a fence asked to call out, as 1-based line numbers. `added` and
 * `removed` are painted the way a diff paints a changed line; `marked` is a
 * neutral emphasis for lines that are not a change.
 */
export type CodeHighlights = {
  marked: number[]
  added: number[]
  removed: number[]
}

export type MarkdownSegment =
  | { type: 'html'; html: string }
  | {
      type: 'code'
      name: string
      contents: string
      highlights: CodeHighlights
    }

type CodeBlock = { name: string; contents: string; highlights: CodeHighlights }

/** Marks where a code block was lifted out, so the HTML can be split on it. */
const CODE_MARKER_PREFIX = 'code-block:'

/** Serializes as `data-fence-meta`, which survives `rehype-raw`. */
const FENCE_META_PROPERTY = 'dataFenceMeta'

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
    [FENCE_META_PROPERTY]?: unknown
  }
  data?: {
    meta?: unknown
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

/**
 * A fence's meta, the `{3,7-9}` after the language, arrives on the code
 * element's `data`. `rehype-raw` rebuilds the tree by serializing it to HTML
 * and parsing it back, and `data` does not survive that round trip, so the meta
 * is copied to an attribute first and read off that later.
 */
function rehypeKeepFenceMeta() {
  return (tree: HastRoot) => {
    visit(tree, (node: unknown) => {
      if (!isElementNode(node) || node.tagName !== 'code') return

      const meta = node.data?.meta

      if (typeof meta !== 'string' || !meta) return

      node.properties = { ...node.properties, [FENCE_META_PROPERTY]: meta }
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

/**
 * Reads the lines a fence asked to call out, written after the language as
 * ```ts {3, +9, -12, 16-18}. A bare number is a neutral highlight, `+` marks
 * the line as an addition, and `-` marks it as a removal; a prefix carries
 * across a range. Line numbers past the end of the block are dropped, so a
 * typo in a range cannot generate rules for thousands of lines that do not
 * exist.
 */
function readCodeHighlights(
  codeElement: HastElement,
  lineCount: number,
): CodeHighlights {
  const meta = codeElement.properties?.[FENCE_META_PROPERTY]
  const empty: CodeHighlights = { marked: [], added: [], removed: [] }

  if (typeof meta !== 'string') return empty

  const braced = meta.match(/\{([^}]*)\}/)
  const list = braced?.[1]

  if (!list) return empty

  const collected = {
    marked: new Set<number>(),
    added: new Set<number>(),
    removed: new Set<number>(),
  }

  for (const entry of list.split(',')) {
    const parsed = entry.trim().match(/^([+-])?(\d+)(?:\s*-\s*(\d+))?$/)
    const rangeStart = parsed?.[2]

    if (!rangeStart) continue

    const start = Number(rangeStart)
    const end = parsed[3] === undefined ? start : Number(parsed[3])

    if (start < 1 || end < start) continue

    const prefix = parsed[1]
    const target =
      prefix === '+'
        ? collected.added
        : prefix === '-'
          ? collected.removed
          : collected.marked

    for (
      let lineNumber = start;
      lineNumber <= Math.min(end, lineCount);
      lineNumber += 1
    ) {
      target.add(lineNumber)
    }
  }

  const sorted = (lineNumbers: Set<number>) =>
    [...lineNumbers].sort((first, second) => first - second)

  return {
    marked: sorted(collected.marked),
    added: sorted(collected.added),
    removed: sorted(collected.removed),
  }
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
      // remark adds a closing newline that the code block would render as an
      // empty last line.
      const contents = readElementText(codeElement).replace(/\n$/, '')

      codeBlocks.push({
        name: buildCodeFileName(
          namePrefix,
          blockIndex,
          readFenceLanguage(codeElement),
        ),
        contents,
        highlights: readCodeHighlights(
          codeElement,
          contents.split('\n').length,
        ),
      })

      parent.children[index] = {
        type: 'comment',
        value: `${CODE_MARKER_PREFIX}${blockIndex}`,
      }

      return SKIP
    })

    visit(tree, (node: unknown) => {
      if (!isElementNode(node) || node.tagName !== 'code') return
      if (!node.properties) return

      delete node.properties[FENCE_META_PROPERTY]
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
        highlights: codeBlock.highlights,
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
    .use(rehypeKeepFenceMeta)
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeWrapTables)
    .use(rehypeExtractCodeBlocks, codeBlocks, namePrefix)
    .use(rehypeStringify)
    .process(markdown)

  return splitHtmlIntoSegments(String(rendered), codeBlocks)
}
