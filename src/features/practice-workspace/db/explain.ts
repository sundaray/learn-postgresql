import { Result } from 'better-result'

import { InvalidPlanJson, describeCause } from './errors'

export type ExplainNode = {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  Alias?: string
  Filter?: string
  'Index Cond'?: string
  'Plan Rows'?: number
  'Actual Rows'?: number
  'Actual Loops'?: number
  'Rows Removed by Filter'?: number
  'Shared Hit Blocks'?: number
  'Shared Read Blocks'?: number
  Plans?: ExplainNode[]
}

export type ExplainResult = {
  root: ExplainNode
  planningTimeMs: number | null
  executionTimeMs: number | null
}

type ExplainEnvelope = {
  Plan: ExplainNode
  'Planning Time'?: number
  'Execution Time'?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOptionalPropertyOfType(
  value: Record<string, unknown>,
  property: string,
  type: 'number' | 'string',
) {
  return value[property] === undefined || typeof value[property] === type
}

function isExplainNode(value: unknown): value is ExplainNode {
  if (!isRecord(value) || typeof value['Node Type'] !== 'string') {
    return false
  }

  const stringProperties = [
    'Relation Name',
    'Index Name',
    'Alias',
    'Filter',
    'Index Cond',
  ]
  const numberProperties = [
    'Plan Rows',
    'Actual Rows',
    'Actual Loops',
    'Rows Removed by Filter',
    'Shared Hit Blocks',
    'Shared Read Blocks',
  ]

  if (
    !stringProperties.every((property) =>
      hasOptionalPropertyOfType(value, property, 'string'),
    ) ||
    !numberProperties.every((property) =>
      hasOptionalPropertyOfType(value, property, 'number'),
    )
  ) {
    return false
  }

  return (
    value.Plans === undefined ||
    (Array.isArray(value.Plans) && value.Plans.every(isExplainNode))
  )
}

export function* walkPlan(node: ExplainNode): Generator<ExplainNode> {
  yield node

  for (const child of node.Plans ?? []) {
    yield* walkPlan(child)
  }
}

export function planNodes(result: ExplainResult): ExplainNode[] {
  return [...walkPlan(result.root)]
}

function isExplainEnvelope(value: unknown): value is ExplainEnvelope {
  return (
    isRecord(value) &&
    isExplainNode(value.Plan) &&
    hasOptionalPropertyOfType(value, 'Planning Time', 'number') &&
    hasOptionalPropertyOfType(value, 'Execution Time', 'number')
  )
}

/**
 * EXPLAIN (FORMAT JSON) returns a single row whose only column holds the plan.
 * PGlite surfaces that column either as parsed JSON or as a JSON string
 * depending on the statement, so both shapes are handled here.
 */
export function parseExplainResult(rows: unknown[]): ExplainResult | null {
  const firstRow = rows[0]

  if (!isRecord(firstRow)) {
    return null
  }

  const columnValue = Object.values(firstRow)[0]
  const parsed =
    typeof columnValue === 'string'
      ? parsePlanJson(columnValue).unwrapOr(null)
      : columnValue

  const envelope = Array.isArray(parsed) ? parsed[0] : parsed

  if (!isExplainEnvelope(envelope)) {
    return null
  }

  return {
    root: envelope.Plan,
    planningTimeMs: envelope['Planning Time'] ?? null,
    executionTimeMs: envelope['Execution Time'] ?? null,
  }
}

function parsePlanJson(value: string): Result<unknown, InvalidPlanJson> {
  return Result.try({
    try: () => JSON.parse(value) as unknown,
    catch: (cause) =>
      new InvalidPlanJson({
        cause,
        message: `EXPLAIN output was not valid JSON: ${describeCause(cause)}`,
      }),
  })
}
