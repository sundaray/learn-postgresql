import type { PostgresError } from './postgres-error'

type ErrorLocation = {
  lineNumber: number
  text: string
  column: number
}

/**
 * PostgreSQL reports the error position as a 1-based character offset into the
 * whole statement, so the line and column have to be recovered from the SQL.
 */
function findErrorLocation(sql: string, position: number): ErrorLocation | null {
  if (position < 1) return null

  let remaining = Math.min(position - 1, sql.length)

  for (const [index, text] of sql.split('\n').entries()) {
    if (remaining <= text.length) {
      return { lineNumber: index + 1, text, column: remaining }
    }

    remaining -= text.length + 1
  }

  return null
}

/**
 * Tabs are kept so the caret lands under the offending character whatever tab
 * width the output is rendered at.
 */
function caretPadding(text: string, column: number): string {
  return [...text.slice(0, column)]
    .map((character) => (character === '\t' ? '\t' : ' '))
    .join('')
}

/**
 * Rebuilds the block psql prints for a rejected statement: the severity and
 * message, the offending line with a caret under it, then detail and hint when
 * the server sent them.
 */
export function formatPostgresError(
  error: PostgresError,
  sql: string,
): string {
  const lines = [`${error.severity}:  ${error.message}`]
  const location =
    error.position === null ? null : findErrorLocation(sql, error.position)

  if (location) {
    const marker = `LINE ${location.lineNumber}: `
    const padding = caretPadding(location.text, location.column)

    lines.push(`${marker}${location.text}`)
    lines.push(`${' '.repeat(marker.length)}${padding}^`)
  }

  if (error.detail) {
    lines.push(`DETAIL:  ${error.detail}`)
  }

  if (error.hint) {
    lines.push(`HINT:  ${error.hint}`)
  }

  return lines.join('\n')
}
