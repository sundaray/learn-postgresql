import type { FileOptions } from '@pierre/diffs'

import type { CodeHighlights } from '@/lib/markdown'

/**
 * Shared by every code block on the site, so a snippet in a blog post is
 * highlighted exactly like the same snippet in a lesson.
 */
export const codeBlockFileOptions = {
  theme: 'night-owl',
  disableFileHeader: true,
  overflow: 'scroll',
} as const satisfies FileOptions<undefined>

/**
 * How each kind of called-out line is painted. Additions and removals borrow
 * the colors and the `+`/`-` sign Pierre computes for its own diffs, so a
 * marked line in a post reads as the same change a real diff would show. A
 * neutral highlight has no counterpart in the library, so it uses the site's
 * own blue and gets no sign.
 */
const HIGHLIGHT_STYLES = {
  marked: {
    background:
      'color-mix(in oklab, var(--color-navy-600, oklch(0.5 0.127 248)) 22%, transparent)',
    accent: 'var(--color-navy-600, oklch(0.5 0.127 248))',
    sign: null,
  },
  added: {
    background: 'var(--diffs-bg-addition)',
    accent: 'var(--diffs-addition-base)',
    sign: '+',
  },
  removed: {
    background: 'var(--diffs-bg-deletion)',
    accent: 'var(--diffs-deletion-base)',
    sign: '-',
  },
} as const

type HighlightStyle = (typeof HIGHLIGHT_STYLES)[keyof typeof HIGHLIGHT_STYLES]

/**
 * night-owl's deletion red is both darker than its addition green and painted
 * at 56% alpha, so a removed line reads far fainter than an added one. The
 * first override replaces it with a red carrying the weight of the green: the
 * green sits at oklch lightness 0.78, and 0.74 is as close as sRGB gets while
 * still reading red rather than pink. Pierre recomputes the sign and the line
 * number from that value.
 *
 * The row tint is set on its own rather than left to Pierre, which mixes the
 * base into the background in Lab. That mix cancels a red much harder than a
 * green: night-owl's background is navy, whose hue sits 141 degrees away from
 * red but only 94 from green, so the removed row landed at chroma 0.028
 * against the added row's 0.044, its hue dragged from 25 round to 325. It read
 * as a washed-out plum beside a clean green. Giving the base more chroma is no
 * fix either, since 0.158 is the sRGB edge at lightness 0.74. These two values
 * hand the removed row the added row's own lightness and chroma at a red hue,
 * one per color scheme, because Pierre mixes at a different ratio in each and
 * the override replaces both.
 */
const DELETION_COLOR_RULE = `
:host {
  --diffs-deletion-color-override: oklch(0.74 0.158 25);
  --diffs-bg-deletion-override: light-dark(
    oklch(0.264 0.038 12),
    oklch(0.31 0.044 12)
  );
}
`

/**
 * Opens a column of room at the start of every row, signed or not, so the code
 * stays in one line down the block. This is what Pierre's own `classic`
 * indicators do, and it is only worth paying when a block has signs to show.
 */
const SIGN_GUTTER_RULE = `
[data-line] {
  padding-inline-start: 2ch;
}
`

function buildHighlightRules(
  lineNumbers: ReadonlyArray<number>,
  style: HighlightStyle,
) {
  if (!lineNumbers.length) return ''

  const codeCells = lineNumbers
    .map((lineNumber) => `[data-line="${lineNumber}"]`)
    .join(', ')
  const numberCells = lineNumbers
    .map((lineNumber) => `[data-column-number="${lineNumber}"]`)
    .join(', ')

  const paint = `
${codeCells}, ${numberCells} {
  background-color: ${style.background};
}

${numberCells} {
  color: ${style.accent};
  box-shadow: inset 2px 0 0 ${style.accent};
  border-right-color: transparent;
  opacity: 1;
}
`

  if (!style.sign) return paint

  // Sits in the room `SIGN_GUTTER_RULE` opens, positioned against the row,
  // which the library already gives `position: relative`. It is left out of
  // selections so dragging across the code does not pick the sign up.
  const signCells = lineNumbers
    .map((lineNumber) => `[data-line="${lineNumber}"]::before`)
    .join(', ')

  return `${paint}
${signCells} {
  content: "${style.sign}";
  color: ${style.accent};
  user-select: none;
  position: absolute;
  top: 0;
  left: 0;
  width: 1ch;
  height: 1lh;
  display: inline-block;
}
`
}

/**
 * Builds the options for one code block, adding the CSS that calls out its
 * highlighted lines.
 *
 * Pierre renders into shadow DOM, so nothing in app.css can reach a line.
 * `unsafeCSS` is injected inside that shadow root instead, under an
 * `@layer unsafe` that outranks the theme. A row spans two grid columns: the
 * code cell carries `data-line` and its line number carries
 * `data-column-number`, both 1-based, so both are painted to light the whole
 * row. The stripe is an inset shadow rather than a border so the number column
 * keeps its width. That column also carries a 2px right border in the base
 * background, the library's separator, which would otherwise cut a dark line
 * through a painted row; clearing its color lets the row's own color show
 * through the border box without moving anything.
 *
 * The library draws `+` and `-` the same way, through a `::before` on the row,
 * but only in diff mode, where a row it computed carries a `data-line-type`
 * saying it changed. A post renders one plain file, so the sign is written
 * against the line numbers the fence named instead.
 *
 * Pierre does not promise `unsafeCSS`, these attributes, or the `--diffs-*`
 * variables stay stable across releases, including patch ones, so a version
 * bump is worth a look here.
 */
export function buildCodeBlockFileOptions(
  highlights: CodeHighlights | undefined,
): FileOptions<undefined> {
  if (!highlights) return codeBlockFileOptions

  const hasSigns = Boolean(
    highlights.added.length || highlights.removed.length,
  )

  const unsafeCSS = [
    hasSigns ? SIGN_GUTTER_RULE : '',
    highlights.removed.length ? DELETION_COLOR_RULE : '',
    buildHighlightRules(highlights.marked, HIGHLIGHT_STYLES.marked),
    buildHighlightRules(highlights.added, HIGHLIGHT_STYLES.added),
    buildHighlightRules(highlights.removed, HIGHLIGHT_STYLES.removed),
  ]
    .join('')
    .trim()

  if (!unsafeCSS) return codeBlockFileOptions

  return { ...codeBlockFileOptions, unsafeCSS }
}

/** Pierre's server-rendered markup, keyed by code block file name. */
export type CodeBlockPreloads = Readonly<Record<string, string>>
