import type { PGliteInterface } from '@electric-sql/pglite'
import { Result } from 'better-result'

import type { LessonStatement } from '@/features/lessons'

import {
  ExplainUnavailable,
  IndexNamesUnavailable,
  StatementFailed,
  describeCause,
} from './errors'
import { parseExplainResult } from './explain'
import type { ExplainResult } from './explain'

export type StatementLabel = LessonStatement | 'OTHER'

export type QueryRunError = {
  message: string
  position: number | null
}

export type QueryRun = {
  sql: string
  statements: StatementLabel[]
  rows: Record<string, unknown>[]
  fieldNames: string[]
  affectedRows: number | null
  explain: ExplainResult | null
  indexNames: string[]
  durationMs: number
  error: QueryRunError | null
}

const explainOptions = 'ANALYZE, BUFFERS, FORMAT JSON'

/**
 * Lessons teach the EXPLAIN form people actually type, without FORMAT JSON.
 * The panel and the completion rules need structured output, so the option is
 * added here instead of in the SQL the learner reads.
 */
export function ensureJsonExplain(statement: string): string {
  const explainMatch = /^EXPLAIN\s*/i.exec(statement)

  if (!explainMatch) {
    return statement
  }

  const rest = statement.slice(explainMatch[0].length)

  if (rest.startsWith('(')) {
    const closingIndex = rest.indexOf(')')

    if (closingIndex === -1) {
      return statement
    }

    const options = rest
      .slice(1, closingIndex)
      .split(',')
      .map((option) => option.trim())
      .filter((option) => option.length > 0 && !/^FORMAT\b/i.test(option))

    return `EXPLAIN (${[...options, 'FORMAT JSON'].join(', ')})${rest.slice(closingIndex + 1)}`
  }

  // Legacy keyword form: EXPLAIN ANALYZE VERBOSE SELECT ...
  const legacyMatch = /^((?:ANALYZE|VERBOSE)\s+)*/i.exec(rest)
  const consumed = legacyMatch?.[0] ?? ''
  const keywords = consumed
    .split(/\s+/)
    .map((keyword) => keyword.toUpperCase())
    .filter((keyword) => keyword.length > 0)

  return `EXPLAIN (${[...keywords, 'FORMAT JSON'].join(', ')}) ${rest.slice(consumed.length)}`
}

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

function readErrorPosition(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const candidate = (error as { position?: unknown }).position

  if (typeof candidate === 'number') return candidate
  if (typeof candidate === 'string') {
    const parsed = Number.parseInt(candidate, 10)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

function readIndexNames(
  database: PGliteInterface,
): Promise<Result<string[], IndexNamesUnavailable>> {
  return Result.tryPromise({
    try: async () => {
      const result = await database.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname",
      )
      const rows: unknown[] = result.rows

      return rows.flatMap((row) =>
        isRecord(row) && typeof row.indexname === 'string' ? [row.indexname] : [],
      )
    },
    catch: (cause) =>
      new IndexNamesUnavailable({
        cause,
        message: `Could not read the index list: ${describeCause(cause)}`,
      }),
  })
}

/**
 * A bare SELECT produces rows but no plan. Re-running it under EXPLAIN is safe
 * because the statement is read-only, and it gives lessons the plan evidence
 * they check against.
 */
function explainSelect(
  database: PGliteInterface,
  statementText: string,
): Promise<Result<ExplainResult | null, ExplainUnavailable>> {
  return Result.tryPromise({
    try: async () => {
      const explained = await database.query(
        `EXPLAIN (${explainOptions}) ${statementText}`,
      )
      const explainedRows: unknown[] = explained.rows

      return parseExplainResult(explainedRows)
    },
    catch: (cause) =>
      new ExplainUnavailable({
        cause,
        message: `Could not produce a plan for this SELECT: ${describeCause(cause)}`,
      }),
  })
}

/**
 * Only rewrite when an EXPLAIN actually needs it, so ordinary statements reach
 * PostgreSQL byte for byte and error positions stay meaningful.
 */
function buildExecutableSql(
  statementTexts: string[],
  statements: StatementLabel[],
  sql: string,
): string {
  const needsJsonExplain = statementTexts.some(
    (statement, index) =>
      statements[index] === 'EXPLAIN' && !/FORMAT\s+JSON/i.test(statement),
  )

  if (!needsJsonExplain) {
    return sql
  }

  return `${statementTexts
    .map((statement, index) =>
      statements[index] === 'EXPLAIN' ? ensureJsonExplain(statement) : statement,
    )
    .join(';\n')};`
}

export async function runQuery(
  database: PGliteInterface,
  sql: string,
): Promise<QueryRun> {
  const statementTexts = splitStatements(sql)
  const statements = statementTexts.map(labelStatement)
  const startedAt = performance.now()

  const emptyRun: Omit<QueryRun, 'error' | 'durationMs' | 'indexNames'> = {
    sql,
    statements,
    rows: [],
    fieldNames: [],
    affectedRows: null,
    explain: null,
  }

  const execResult = await Result.tryPromise({
    try: () =>
      database.exec(buildExecutableSql(statementTexts, statements, sql)),
    catch: (cause) =>
      new StatementFailed({
        cause,
        message: describeCause(cause),
        position: readErrorPosition(cause),
      }),
  })

  if (Result.isError(execResult)) {
    return {
      ...emptyRun,
      // The index list is advisory, so an unreadable pg_indexes must never
      // displace the SQL error the learner actually needs to see.
      indexNames: (await readIndexNames(database)).unwrapOr([]),
      durationMs: performance.now() - startedAt,
      error: {
        message: execResult.error.message,
        position: execResult.error.position,
      },
    }
  }

  const results = execResult.value
  const lastWithRows = [...results]
    .reverse()
    .find((result) => result.rows.length > 0)

  let explain: ExplainResult | null = null

  for (const result of results) {
    const resultRows: unknown[] = result.rows
    const parsed = parseExplainResult(resultRows)
    if (parsed) {
      explain = parsed
    }
  }

  const selectStatement = statementTexts[0]

  if (
    !explain &&
    statements.length === 1 &&
    statements[0] === 'SELECT' &&
    selectStatement
  ) {
    explain = (await explainSelect(database, selectStatement)).unwrapOr(null)
  }

  const rawRows: unknown[] = lastWithRows?.rows ?? []
  const rows = rawRows.filter(isRecord)

  return {
    ...emptyRun,
    rows,
    fieldNames: lastWithRows?.fields.map((field) => field.name) ?? [],
    affectedRows: lastWithRows?.affectedRows ?? null,
    explain,
    indexNames: (await readIndexNames(database)).unwrapOr([]),
    durationMs: performance.now() - startedAt,
    error: null,
  }
}
