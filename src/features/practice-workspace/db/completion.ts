import type { LessonCompletionRule } from '@/features/lessons'

import { walkPlan } from './explain'
import type { QueryRun } from './run-query'

export type CompletionOutcome = 'met' | 'unmet' | 'manual'

export type CompletionCheck = {
  rule: LessonCompletionRule
  outcome: CompletionOutcome
  detail: string
}

function indexScanNodes(run: QueryRun) {
  if (!run.explain) {
    return []
  }

  return [...walkPlan(run.explain.root)]
}

function evaluateRule(
  rule: LessonCompletionRule,
  run: QueryRun | null,
): CompletionCheck {
  if (rule.kind === 'manual-reflection') {
    return { rule, outcome: 'manual', detail: rule.prompt }
  }

  if (!run) {
    return { rule, outcome: 'unmet', detail: 'Run the statement to check this.' }
  }

  switch (rule.kind) {
    case 'statement-executed': {
      const executed = !run.error && run.statements.includes(rule.statement)
      return {
        rule,
        outcome: executed ? 'met' : 'unmet',
        detail: executed
          ? `${rule.statement} ran successfully.`
          : `No successful ${rule.statement} statement in the last run.`,
      }
    }

    case 'plan-node': {
      const match = indexScanNodes(run).find((node) => {
        const typeMatches = rule.anyOf.some(
          (nodeType) => node['Node Type'] === nodeType,
        )
        const relationMatches =
          !rule.relation || node['Relation Name'] === rule.relation
        return typeMatches && relationMatches
      })

      return {
        rule,
        outcome: match ? 'met' : 'unmet',
        detail: match
          ? `Plan contains ${match['Node Type']}${match['Relation Name'] ? ` on ${match['Relation Name']}` : ''}.`
          : `Plan does not contain ${rule.anyOf.join(' or ')}${rule.relation ? ` on ${rule.relation}` : ''}.`,
      }
    }

    case 'plan-uses-index': {
      const match = indexScanNodes(run).find(
        (node) =>
          node['Index Name'] === rule.indexName &&
          rule.anyOf.some((nodeType) => node['Node Type'] === nodeType),
      )

      return {
        rule,
        outcome: match ? 'met' : 'unmet',
        detail: match
          ? `Plan uses ${rule.indexName} via ${match['Node Type']}.`
          : `Plan does not use ${rule.indexName}.`,
      }
    }

    case 'index-exists': {
      const exists = run.indexNames.includes(rule.indexName)
      return {
        rule,
        outcome: exists ? 'met' : 'unmet',
        detail: exists
          ? `${rule.indexName} exists.`
          : `${rule.indexName} does not exist yet.`,
      }
    }

    case 'index-absent': {
      const absent = !run.indexNames.includes(rule.indexName)
      return {
        rule,
        outcome: absent ? 'met' : 'unmet',
        detail: absent
          ? `${rule.indexName} is absent.`
          : `${rule.indexName} still exists.`,
      }
    }
  }
}

export function describeCompletionRule(rule: LessonCompletionRule) {
  switch (rule.kind) {
    case 'statement-executed':
      return `Run a ${rule.statement} statement successfully.`
    case 'plan-node': {
      const relation = rule.relation ? ` on ${rule.relation}` : ''
      const advisory = rule.advisory ? ' when selected by the planner' : ''
      return `Observe ${rule.anyOf.join(' or ')}${relation}${advisory}.`
    }
    case 'plan-uses-index': {
      const advisory = rule.advisory ? ' when selected by the planner' : ''
      return `Observe ${rule.indexName} in an indexed plan${advisory}.`
    }
    case 'index-exists':
      return `Confirm that ${rule.indexName} exists.`
    case 'index-absent':
      return `Confirm that ${rule.indexName} is absent.`
    case 'manual-reflection':
      return rule.prompt
  }
}

export function evaluateCompletion(
  rules: LessonCompletionRule[],
  run: QueryRun | null,
): CompletionCheck[] {
  return rules.map((rule) => evaluateRule(rule, run))
}
