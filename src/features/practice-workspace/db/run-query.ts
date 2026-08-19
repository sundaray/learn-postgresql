import { parse, protocol } from '@electric-sql/pglite'
import type { PGlite, Results, messages } from '@electric-sql/pglite'
import { Result } from 'better-result'

import type { LessonStatement } from '@/features/lessons'

import { StatementFailed } from './errors'
import type { PostgresError } from './postgres-error'
import { readPostgresError } from './postgres-error'

export type StatementLabel = LessonStatement | 'OTHER'

export type QueryRunError = PostgresError

export type ResultField = {
  name: string
  /** The column's PostgreSQL type, so values print the way psql prints them. */
  dataTypeId: number
}

export type QueryRun = {
  sql: string
  statements: StatementLabel[]
  rows: Record<string, unknown>[]
  fields: ResultField[]
  affectedRows: number | null
  /** PostgreSQL's own reply to each statement: `CREATE INDEX`, `UPDATE 3`. */
  commandTags: string[]
  explainOutput: string | null
  durationMs: number
  error: QueryRunError | null
}

/**
 * The two members `exec` reaches for internally. PGliteInterface leaves both
 * out, so the parameter names the pair this module uses instead.
 */
type QueryDatabase = Pick<PGlite, 'execProtocolStream' | 'parsers'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}

export function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let quote: string | null = null

  for (const character of stripComments(sql)) {
    if (quote) {
      current += character
      if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === "'" || character === '"') {
      quote = character
      current += character
      continue
    }

    if (character === ';') {
      if (current.trim()) {
        statements.push(current.trim())
      }
      current = ''
      continue
    }

    current += character
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

export function labelStatement(statement: string): StatementLabel {
  const normalized = statement.trim().toUpperCase()

  if (normalized.startsWith('EXPLAIN')) return 'EXPLAIN'
  if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
    return 'SELECT'
  }
  if (normalized.startsWith('ANALYZE')) return 'ANALYZE'
  if (normalized.startsWith('VACUUM')) return 'VACUUM'
  if (/^CREATE\s+(UNIQUE\s+)?INDEX/.test(normalized)) return 'CREATE INDEX'
  if (normalized.startsWith('DROP INDEX')) return 'DROP INDEX'

  return 'OTHER'
}

const explainFormats = ['TEXT', 'JSON', 'XML', 'YAML'] as const

type ExplainFormat = (typeof explainFormats)[number]

function isExplainFormat(value: string | undefined): value is ExplainFormat {
  return (
    value !== undefined &&
    explainFormats.some((format) => format === value)
  )
}

function assertNever(value: never): never {
  throw new Error(`Unhandled EXPLAIN format: ${String(value)}`)
}

function readExplainFormat(statement: string): ExplainFormat {
  const explain = /^\s*EXPLAIN\b/i.exec(statement)

  if (!explain) return 'TEXT'

  const remainder = statement.slice(explain[0].length).trimStart()

  // FORMAT is only accepted inside the parenthesized EXPLAIN options. Text is
  // the default for a bare EXPLAIN and for the legacy ANALYZE/VERBOSE syntax.
  if (!remainder.startsWith('(')) return 'TEXT'

  const closingIndex = remainder.indexOf(')')
  if (closingIndex === -1) return 'TEXT'

  const format = /\bFORMAT\s*(?:=\s*)?(TEXT|JSON|XML|YAML)\b/i
    .exec(remainder.slice(1, closingIndex))?.[1]
    ?.toUpperCase()

  if (!isExplainFormat(format)) return 'TEXT'

  switch (format) {
    case 'TEXT':
      return 'TEXT'
    case 'JSON':
      return 'JSON'
    case 'XML':
      return 'XML'
    case 'YAML':
      return 'YAML'
    default:
      return assertNever(format)
  }
}

function readExplainValue(row: unknown): string {
  const value = isRecord(row) ? Object.values(row)[0] : row

  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value

  return JSON.stringify(value, null, 2)
}

/** JSON, XML and YAML remain raw documents rather than psql-style tables. */
function readStructuredExplain(rows: unknown[]): string {
  return rows.map(readExplainValue).join('\n')
}

function center(value: string, width: number): string {
  const available = Math.max(0, width - value.length)
  const left = Math.floor(available / 2)
  const right = available - left

  return `${' '.repeat(left)}${value}${' '.repeat(right)}`
}

/** Reproduces psql's aligned, single-column display for text EXPLAIN output. */
function formatPsqlTextExplain(
  result: Results<Record<string, unknown>>,
): string {
  const heading = result.fields[0]?.name ?? 'QUERY PLAN'
  const lines = result.rows.map(readExplainValue)
  const columnWidth = Math.max(
    heading.length,
    ...lines.map((line) => line.length),
  )
  const rowLabel = lines.length === 1 ? 'row' : 'rows'

  return [
    ` ${center(heading, columnWidth)} `,
    '-'.repeat(columnWidth + 2),
    ...lines.map((line) => ` ${line}`),
    `(${lines.length} ${rowLabel})`,
  ].join('\n')
}

function readExplainOutput(
  results: readonly Results<Record<string, unknown>>[],
  statementTexts: readonly string[],
  statements: readonly StatementLabel[],
): string | null {
  const blocks = results.flatMap((result, index) =>
    statements[index] === 'EXPLAIN' && result.rows.length > 0
      ? [
          readExplainFormat(statementTexts[index] ?? '') === 'TEXT'
            ? formatPsqlTextExplain(result)
            : readStructuredExplain(result.rows),
        ]
      : [],
  )

  return blocks.length > 0 ? blocks.join('\n\n') : null
}

/** EXPLAIN has a dedicated text/document renderer, so it skips the row table. */
function findRowResult(
  results: readonly Results<Record<string, unknown>>[],
  statements: readonly StatementLabel[],
) {
  return [...results.entries()]
    .reverse()
    .find(
      ([index, result]) =>
        statements[index] !== 'EXPLAIN' && result.rows.length > 0,
    )?.[1]
}

function readCommandTag(message: messages.BackendMessage): string | null {
  if (message.name !== 'commandComplete' || !('text' in message)) {
    return null
  }

  return typeof message.text === 'string' ? message.text : null
}

/**
 * PostgreSQL answers every statement with a command tag, and for a statement
 * that returns no rows the tag is the entire answer: `CREATE INDEX` for one,
 * `UPDATE 3` for another. PGlite's `exec` reads the tag only far enough to
 * pull an affected-row count out of it and then throws the text away, so this
 * sends the same simple-query message `exec` sends and keeps both: PGlite
 * still parses the rows, and the tags survive alongside them.
 */
async function execKeepingCommandTags(database: QueryDatabase, sql: string) {
  const backendMessages = await database.execProtocolStream(
    protocol.serialize.query(sql),
  )

  return {
    results: parse.parseResults(backendMessages, database.parsers),
    commandTags: backendMessages.flatMap((message) => {
      const tag = readCommandTag(message)

      return tag === null ? [] : [tag]
    }),
  }
}

export async function runQuery(
  database: QueryDatabase,
  sql: string,
): Promise<QueryRun> {
  const statementTexts = splitStatements(sql)
  const statements = statementTexts.map(labelStatement)
  const startedAt = performance.now()

  const emptyRun: Omit<QueryRun, 'error' | 'durationMs'> = {
    sql,
    statements,
    rows: [],
    fields: [],
    affectedRows: null,
    commandTags: [],
    explainOutput: null,
  }

  // The statement reaches PostgreSQL byte for byte, so EXPLAIN keeps whatever
  // options the learner typed and error positions stay meaningful.
  const execResult = await Result.tryPromise({
    try: () => execKeepingCommandTags(database, sql),
    catch: (cause) =>
      new StatementFailed({ cause, ...readPostgresError(cause) }),
  })

  if (Result.isError(execResult)) {
    return {
      ...emptyRun,
      durationMs: performance.now() - startedAt,
      error: {
        severity: execResult.error.severity,
        message: execResult.error.message,
        detail: execResult.error.detail,
        hint: execResult.error.hint,
        position: execResult.error.position,
      },
    }
  }

  const { results, commandTags } = execResult.value
  const rowResult = findRowResult(results, statements)
  const rawRows: unknown[] = rowResult?.rows ?? []

  return {
    ...emptyRun,
    rows: rawRows.filter(isRecord),
    fields:
      rowResult?.fields.map((field) => ({
        name: field.name,
        dataTypeId: field.dataTypeID,
      })) ?? [],
    affectedRows: rowResult?.affectedRows ?? null,
    commandTags,
    explainOutput: readExplainOutput(results, statementTexts, statements),
    durationMs: performance.now() - startedAt,
    error: null,
  }
}
